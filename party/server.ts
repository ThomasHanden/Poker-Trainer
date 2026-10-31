// Cloudflare table server. Each table code gets its own PokerTable instance (a Durable Object),
// which holds the game and its chat in memory and talks to the players over WebSockets. One Bank
// instance holds everyone's chips and daily claims: tables draw buy-ins from it and pay stacks back.
// The game and chat rules live in src/multiplayer/; this file moves messages, money and the timer.

import { DurableObject } from 'cloudflare:workers';
import { Server, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { BOT_SEATS, LiveTable, MAX_SEATS, buyInFor, checkBuyIn, cleanName, fmtChips, isPublicTable, stakesFor } from '../src/multiplayer/table';
import { KEY_PATTERN, claimDaily, deposit, playerId, rollDaily, status, upgrade, utcDay, withdraw, type Account, type BankStatus } from '../src/multiplayer/bank';
import { ChatRoom } from '../src/multiplayer/chat';

type Env = {
  PokerTable: DurableObjectNamespace<PokerTable>;
  Bank: DurableObjectNamespace<Bank>;
  /** wrangler.jsonc vars: how many seats bots fill at public tables (0 turns bots off) */
  BOT_SEATS?: string;
};

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
}

const bankOf = (env: Env) => env.Bank.get(env.Bank.idFromName('bank'));

/** Each connection's player, and whether its page understands chat (older pages are never sent any). */
type ConnState = { pid: string; chat: boolean };

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

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const params = new URL(ctx.request.url).searchParams;
    const key = params.get('key') ?? '';
    if (!KEY_PATTERN.test(key)) return conn.close(4001, 'Missing player key');
    const pid = await playerId(key);
    conn.setState({ pid, chat: params.get('chat') === '1' } satisfies ConnState);
    this.table.setOnline(pid, true);
    await this.update();
    await this.sendBank(pid);
  }

  async onMessage(conn: Connection, raw: WSMessage) {
    const pid = this.pidOf(conn);
    if (!pid || typeof raw !== 'string' || raw.length > 4000) return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const m = msg as { type?: unknown; name?: unknown; seat?: unknown; buyIn?: unknown; cid?: unknown; text?: unknown };
    if (m?.type === 'chat') return this.onChat(conn, pid, m.cid, m.text);
    const err = m?.type === 'sit' ? await this.sit(pid, m.name, m.seat, m.buyIn) : this.table.handle(pid, msg);
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
  async sit(pid: string, rawName: unknown, rawSeat: unknown, rawBuyIn: unknown): Promise<string | null> {
    const name = cleanName(rawName);
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

export default {
  async fetch(request: Request, env: Env) {
    // POST /bank or /bank/claim with the player's key as the body (plain text, so browsers send it
    // without a CORS preflight): their chips for the lobby, or today's claim
    const path = new URL(request.url).pathname;
    if ((path === '/bank' || path === '/bank/claim') && request.method === 'POST') {
      const key = (await request.text()).trim();
      if (!KEY_PATTERN.test(key)) return Response.json({ error: 'bad key' }, { status: 400, headers: CORS });
      const pid = await playerId(key);
      const body = path === '/bank/claim' ? await bankOf(env).claim(pid) : await bankOf(env).status(pid);
      return Response.json({ ...body, refillsAt: body.nextClaimAt }, { headers: CORS });
    }
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
