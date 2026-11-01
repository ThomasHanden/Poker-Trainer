// Cloudflare table server. Each table code gets its own PokerTable instance (a Durable Object),
// which holds the game and its chat in memory and talks to the players over WebSockets. One Bank
// instance holds everyone's chips and daily claims: tables draw buy-ins from it and pay stacks back.
// The game and chat rules live in src/multiplayer/; this file moves messages, money and the timer.

import { DurableObject } from 'cloudflare:workers';
import { Server, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { BOT_SEATS, LiveTable, MAX_SEATS, buyInFor, checkBuyIn, cleanName, fmtChips, isPublicTable, stakesFor } from '../src/multiplayer/table';
import { KEY_PATTERN, claimDaily, deposit, moveGuestChips, playerId, rollDaily, status, upgrade, utcDay, withdraw, type Account, type BankStatus } from '../src/multiplayer/bank';
import { ChatRoom } from '../src/multiplayer/chat';
import { accountPlayerId, fetchDisplayName, nameIsTaken, verifyAccessToken, type AccountAuthConfig } from '../src/multiplayer/accounts';
import { nameProblem } from '../src/multiplayer/moderation';

type Env = {
  PokerTable: DurableObjectNamespace<PokerTable>;
  Bank: DurableObjectNamespace<Bank>;
  /** wrangler.jsonc vars: how many seats bots fill at public tables (0 turns bots off) */
  BOT_SEATS?: string;
  /** wrangler.jsonc vars: the Supabase project that signs players in (empty: accounts off) */
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

const authConfig = (env: Env): AccountAuthConfig => ({ supabaseUrl: env.SUPABASE_URL ?? '', publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? '' });

/** The player a signed-in browser's access token belongs to, or null. */
async function accountFromToken(token: unknown, env: Env): Promise<string | null> {
  const userId = await verifyAccessToken(token, authConfig(env));
  return userId ? accountPlayerId(userId) : null;
}

/** How long a signed-in connection has to send its token before it is closed. */
const AUTH_WAIT_MS = 10_000;

/** Bots only sit at public tables, filling up to BOT_SEATS players. */
function botSeatsFor(room: string, env: Env): number {
  if (!isPublicTable(room)) return 0;
  const n = Number(env.BOT_SEATS ?? BOT_SEATS);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SEATS ? n : BOT_SEATS;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

// Each method reads an account and writes it back with nothing else awaited in between. The
// Durable Object's input gate holds every other request until then, so two requests (a double
// click, two tabs, two devices) can never both spend or claim from the same balance.
export class Bank extends DurableObject<Env> {
  private async load(pid: string): Promise<Account> {
    return upgrade(await this.ctx.storage.get<Account>(pid));
  }

  async status(pid: string): Promise<BankStatus> {
    return status(await this.load(pid), Date.now());
  }

  /** Today's chips, chosen here with server time: paid once per UTC day; asking again returns that claim without paying. */
  async claim(pid: string): Promise<BankStatus & { amount: number; paid: boolean }> {
    const now = Date.now();
    const { acc, amount, paid } = claimDaily(await this.load(pid), utcDay(now), () => rollDaily(rand32));
    if (paid) await this.ctx.storage.put(pid, acc);
    return { ...status(acc, now), amount, paid };
  }

  /** Draw a buy-in; returns the amount taken (0 when there is not enough). */
  async withdraw(pid: string, want: number, min: number): Promise<number> {
    const { acc, amount } = withdraw(await this.load(pid), want, min);
    await this.ctx.storage.put(pid, acc);
    return amount;
  }

  async deposit(pid: string, amount: number): Promise<void> {
    await this.ctx.storage.put(pid, deposit(await this.load(pid), amount));
  }

  /** Move a guest wallet's chips into an account (once); both are written in one atomic put. */
  async moveGuest(guestPid: string, accountPid: string): Promise<{ moved: number; status: BankStatus } | { error: string }> {
    const r = moveGuestChips(await this.load(guestPid), guestPid, await this.load(accountPid), accountPid);
    if ('error' in r) return r;
    await this.ctx.storage.put({ [guestPid]: r.guest, [accountPid]: r.account });
    return { moved: r.moved, status: status(r.account, Date.now()) };
  }
}

const bankOf = (env: Env) => env.Bank.get(env.Bank.idFromName('bank'));

/**
 * Each connection's player, and whether its page understands chat (older pages are never sent any).
 * A signed-in connection is `pending` (no player yet) until its token has been checked.
 */
type ConnState = {
  pid: string;
  chat: boolean;
  pending?: boolean;
  /** a signed-in player's account name: they sit under it, not whatever the browser sends */
  name?: string;
};

export class PokerTable extends Server<Env> {
  table = new LiveTable();
  timer: ReturnType<typeof setTimeout> | null = null;
  /** players whose buy-in is on its way from the bank, so a double click cannot buy in twice */
  buyingIn = new Set<string>();
  chat = new ChatRoom();
  /** connections currently receiving the chat: seated players only */
  chatAccess = new Set<string>();
  /** seated people (id → name) as of the last update, to announce arrivals and departures */
  people = new Map<string, string>();

  async onStart() {
    // every table deals by itself once two players are sitting (or one person, and bots, at a public table)
    this.table = new LiveTable({ stakes: stakesFor(this.name), botSeats: botSeatsFor(this.name, this.env) });
    // The game lives in memory, so a restart (a deploy, or Cloudflare moving the table) loses it.
    // Give everyone who was seated (or waiting for a bot's seat) their chips back; an unfinished hand is called off.
    const saved = await this.ctx.storage.get<{ id: string; stack: number }[]>('seats');
    if (saved?.length) {
      for (const s of saved) await bankOf(this.env).deposit(s.id, s.stack);
      await this.ctx.storage.delete('seats');
    }
  }

  /** Plain GET: how full the table is, for the lobby. */
  onRequest() {
    return Response.json(this.table.summary(), { headers: CORS });
  }

  pidOf(conn: Connection): string | undefined {
    return (conn.state as ConnState | null)?.pid;
  }

  /**
   * Guests connect with their browser key in the address. Signed-in players connect with auth=1 and
   * then send their access token as the first message, so the token never appears in a URL.
   */
  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const params = new URL(ctx.request.url).searchParams;
    const chat = params.get('chat') === '1';
    if (params.get('auth') === '1') {
      conn.setState({ pid: '', chat, pending: true } satisfies ConnState);
      setTimeout(() => (conn.state as ConnState | null)?.pending && conn.close(4003, 'Sign-in not confirmed'), AUTH_WAIT_MS);
      return;
    }
    const key = params.get('key') ?? '';
    if (!KEY_PATTERN.test(key)) return conn.close(4001, 'Missing player key');
    await this.joined(conn, await playerId(key), chat);
  }

  /** A connection now known to be this player: they are online, and get the table and their bank. */
  async joined(conn: Connection, pid: string, chat: boolean, name?: string) {
    conn.setState({ pid, chat, ...(name ? { name } : {}) } satisfies ConnState);
    this.table.setOnline(pid, true);
    await this.update();
    await this.sendBank(pid);
  }

  async onMessage(conn: Connection, raw: WSMessage) {
    if (typeof raw !== 'string' || raw.length > 4000) return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const m = msg as { type?: unknown; name?: unknown; seat?: unknown; buyIn?: unknown; cid?: unknown; text?: unknown; token?: unknown };
    const st = conn.state as ConnState | null;
    if (st?.pending) {
      // until the sign-in is confirmed, the only thing this connection may do is confirm it
      if (m?.type !== 'auth') return;
      const pid = await accountFromToken(m.token, this.env);
      if (!pid) {
        conn.send(JSON.stringify({ type: 'auth-error', message: 'Your sign-in could not be confirmed. Sign in again.' }));
        return conn.close(4003, 'Sign-in not confirmed');
      }
      const name = await fetchDisplayName(m.token as string, authConfig(this.env));
      return this.joined(conn, pid, st.chat, name ?? undefined);
    }
    const pid = st?.pid;
    if (!pid) return;
    if (m?.type === 'chat') return this.onChat(conn, pid, m.cid, m.text);
    const err = m?.type === 'sit' ? await this.sit(pid, st?.name ?? m.name, m.seat, m.buyIn, !!st?.name) : this.table.handle(pid, msg);
    if (err) conn.send(JSON.stringify({ type: 'error', message: err }));
    await this.update();
  }

  async onClose(conn: Connection) {
    this.chatAccess.delete(conn.id);
    const pid = this.pidOf(conn);
    if (!pid) return;
    // A reload, or a second tab, can still be connected as the same player.
    const stillHere = [...this.getConnections()].some((c) => c !== conn && this.pidOf(c) === pid);
    if (!stillHere) this.table.setOnline(pid, false);
    await this.update();
  }

  /**
   * Buy in from the bank for the amount chosen and sit in the chosen seat, or wait for it if a bot is
   * playing a hand there (or, already seated or waiting, just stay).
   */
  async sit(pid: string, rawName: unknown, rawSeat: unknown, rawBuyIn: unknown, accountName = false): Promise<string | null> {
    // a signed-in player sits under their account name (unique, and checked by the database)
    const name = accountName ? String(rawName) : cleanName(rawName);
    if (nameProblem(name)) return accountName ? 'Your account name is not allowed at the tables. Change it on your Account page.' : 'That name is not allowed. Choose a different one.';
    // account names belong to their accounts: a guest cannot sit under one
    if (!accountName && !this.table.isSeated(pid) && (await nameIsTaken(name, authConfig(this.env))))
      return `${name} is someone’s account name. Choose a different one, or sign in if it is yours.`;
    if (this.table.isSeated(pid) || this.table.reservationOf(pid)) return this.table.sit(pid, name);
    if (this.buyingIn.has(pid)) return null; // the first request is still at the bank
    const seatProblem = this.table.seatProblem(rawSeat);
    if (seatProblem) return seatProblem;
    const { min, max } = buyInFor(this.table.stakes);
    const want = checkBuyIn(this.table.stakes, rawBuyIn);
    if (want === null) return `Buy in for between ${fmtChips(min)} and ${fmtChips(max)} chips.`;
    const bank = bankOf(this.env);
    this.buyingIn.add(pid);
    try {
      const amount = await bank.withdraw(pid, want, want);
      if (!amount) {
        await this.sendBank(pid);
        return `You do not have ${fmtChips(want)} chips.`;
      }
      // other messages can arrive while we wait for the bank, so the table checks the seat again
      const err = this.table.sit(pid, name, amount, rawSeat as number);
      if (err) await bank.deposit(pid, amount); // the seat went while we were at the bank
      await this.sendBank(pid);
      return err;
    } finally {
      this.buyingIn.delete(pid);
    }
  }

  async sendBank(pid: string) {
    const st = await bankOf(this.env).status(pid);
    // refillsAt: what pages from before daily claims read
    const msg = JSON.stringify({ type: 'bank', ...st, refillsAt: st.nextClaimAt });
    for (const c of this.getConnections()) if (this.pidOf(c) === pid) c.send(msg);
  }

  /**
   * A chat message: accepted only from someone seated, posted under their table name (never one the
   * browser sends), and sent only to seated players. It never touches the game, and a failure here
   * only fails the message.
   */
  onChat(conn: Connection, pid: string, cid: unknown, text: unknown) {
    const id = typeof cid === 'string' ? cid.slice(0, 64) : '';
    const fail = (message: string) => conn.send(JSON.stringify({ type: 'chat-error', cid: id, message }));
    try {
      const name = this.table.personName(pid);
      if (!name || !this.chatAccess.has(conn.id)) return fail('Sit down to chat with the table.');
      const r = this.chat.post(pid, name, text, cid);
      if ('error' in r) return fail(r.error);
      const out = JSON.stringify({ type: 'chat', message: r.message });
      // a retry of a message already posted: only the sender needs to hear about it again
      if (r.repeat) return conn.send(out);
      for (const c of this.getConnections()) if (this.chatAccess.has(c.id)) c.send(out);
    } catch {
      fail('Chat is not available right now.');
    }
  }

  /** Keep the chat to seated people: announce arrivals and departures, give newcomers the history, cut off anyone who stood up. */
  syncChat() {
    try {
      const seated = new Map(this.table.seats.filter((s) => !s.bot).map((s) => [s.id, s.name]));
      const notices = [
        ...[...seated].filter(([id]) => !this.people.has(id)).map(([, name]) => this.chat.notice(`${name} sat down`)),
        ...[...this.people].filter(([id]) => !seated.has(id)).map(([, name]) => this.chat.notice(`${name} left the table`)),
      ];
      this.people = seated;
      for (const c of this.getConnections()) {
        const st = c.state as ConnState | null;
        const may = !!st?.chat && seated.has(st.pid);
        const had = this.chatAccess.has(c.id);
        if (may && !had) {
          this.chatAccess.add(c.id);
          c.send(JSON.stringify({ type: 'chat-history', messages: this.chat.history() }));
        } else if (!may && had) {
          this.chatAccess.delete(c.id);
          c.send(JSON.stringify({ type: 'chat-closed' }));
        } else if (may) {
          for (const n of notices) c.send(JSON.stringify({ type: 'chat', message: n }));
        }
      }
    } catch {
      /* chat trouble never stops the game */
    }
  }

  /** Send everyone their view, pay out anyone who stood up, save the seats, and set the next timer. */
  async update() {
    for (const c of this.getConnections()) {
      const pid = this.pidOf(c);
      if (pid) c.send(JSON.stringify(this.table.viewFor(pid)));
    }
    this.syncChat();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const at = this.table.nextDeadline();
    if (at !== null) {
      this.timer = setTimeout(() => {
        this.table.tick();
        void this.update();
      }, Math.max(0, at - Date.now()));
    }
    const outs = this.table.takeCashouts();
    for (const c of outs) await bankOf(this.env).deposit(c.id, c.amount);
    // what the table holds for people, paid back if it restarts (bots' chips are nobody's)
    await this.ctx.storage.put(
      'seats',
      this.table.heldChips().map((c) => ({ id: c.id, stack: c.amount })),
    );
    for (const pid of new Set(outs.map((c) => c.id))) await this.sendBank(pid);
  }
}

/**
 * Who a bank request is from. The body is plain text, so browsers send it without a CORS preflight:
 * a guest's browser key, or {"token": ...} with a signed-in player's access token.
 */
async function requester(body: string, env: Env): Promise<string | null> {
  if (!body.startsWith('{')) return KEY_PATTERN.test(body) ? playerId(body) : null;
  try {
    return await accountFromToken((JSON.parse(body) as { token?: unknown }).token, env);
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    // POST /bank or /bank/claim: the player's chips for the lobby, or today's claim
    if ((path === '/bank' || path === '/bank/claim') && request.method === 'POST') {
      const pid = await requester((await request.text()).trim(), env);
      if (!pid) return Response.json({ error: 'Not signed in' }, { status: 401, headers: CORS });
      const body = path === '/bank/claim' ? await bankOf(env).claim(pid) : await bankOf(env).status(pid);
      return Response.json({ ...body, refillsAt: body.nextClaimAt }, { headers: CORS });
    }
    // POST /bank/move-guest {"token", "key"}: move this browser's guest chips into the signed-in
    // account, once. Holding both the sign-in and the guest key proves both are yours.
    if (path === '/bank/move-guest' && request.method === 'POST') {
      let body: { token?: unknown; key?: unknown } = {};
      try {
        body = JSON.parse(await request.text());
      } catch {
        /* checked below */
      }
      const accountPid = await accountFromToken(body.token, env);
      if (!accountPid) return Response.json({ error: 'Not signed in' }, { status: 401, headers: CORS });
      if (typeof body.key !== 'string' || !KEY_PATTERN.test(body.key)) return Response.json({ error: 'No guest chips on this browser' }, { status: 400, headers: CORS });
      const r = await bankOf(env).moveGuest(await playerId(body.key), accountPid);
      return Response.json(r, { status: 'error' in r ? 409 : 200, headers: CORS });
    }
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
