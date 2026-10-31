// Cloudflare table server. Each table code gets its own PokerTable instance (a Durable Object),
// which holds the game in memory and talks to the players over WebSockets. One Bank instance
// holds everyone's daily chips: tables draw buy-ins from it and pay stacks back into it.
// The game rules live in src/multiplayer/; this file moves messages, money and the timer.

import { DurableObject } from 'cloudflare:workers';
import { Server, routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { LiveTable, MAX_SEATS, buyInFor, cleanName, fmtChips, isPublicTable, stakesFor } from '../src/multiplayer/table';
import { KEY_PATTERN, deposit, nextRefill, playerId, refresh, utcDay, withdraw, type Account } from '../src/multiplayer/bank';

type Env = { PokerTable: DurableObjectNamespace<PokerTable>; Bank: DurableObjectNamespace<Bank> };

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

export class Bank extends DurableObject<Env> {
  private async load(pid: string): Promise<Account> {
    return refresh(await this.ctx.storage.get<Account>(pid), utcDay(Date.now()));
  }

  async balance(pid: string): Promise<number> {
    const acc = await this.load(pid);
    await this.ctx.storage.put(pid, acc);
    return acc.balance;
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

export class PokerTable extends Server<Env> {
  table = new LiveTable();
  timer: ReturnType<typeof setTimeout> | null = null;

  async onStart() {
    this.table = new LiveTable({ stakes: stakesFor(this.name), autoDeal: isPublicTable(this.name) });
    // The game lives in memory, so a restart (a deploy, or Cloudflare moving the table) loses it.
    // Give everyone who was seated their chips back; an unfinished hand is called off.
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
    return (conn.state as { pid?: string } | null)?.pid;
  }

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const key = new URL(ctx.request.url).searchParams.get('key') ?? '';
    if (!KEY_PATTERN.test(key)) return conn.close(4001, 'Missing player key');
    const pid = await playerId(key);
    conn.setState({ pid });
    this.table.setOnline(pid, true);
    await this.update();
    await this.sendBank(pid);
  }

  async onMessage(conn: Connection, raw: WSMessage) {
    const pid = this.pidOf(conn);
    if (!pid || typeof raw !== 'string' || raw.length > 2000) return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const m = msg as { type?: unknown; name?: unknown };
    const err = m?.type === 'sit' ? await this.sit(pid, m.name) : this.table.handle(pid, msg);
    if (err) conn.send(JSON.stringify({ type: 'error', message: err }));
    await this.update();
  }

  async onClose(conn: Connection) {
    const pid = this.pidOf(conn);
    if (!pid) return;
    // A reload, or a second tab, can still be connected as the same player.
    const stillHere = [...this.getConnections()].some((c) => c !== conn && this.pidOf(c) === pid);
    if (!stillHere) this.table.setOnline(pid, false);
    await this.update();
  }

  /** Buy in from the bank and sit down (or, already seated, just stay). */
  async sit(pid: string, rawName: unknown): Promise<string | null> {
    const name = cleanName(rawName);
    if (this.table.isSeated(pid)) return this.table.sit(pid, name);
    if (this.table.seats.length >= MAX_SEATS) return 'The table is full';
    const { max, min } = buyInFor(this.table.stakes);
    const bank = bankOf(this.env);
    const amount = await bank.withdraw(pid, max, min);
    if (!amount) {
      await this.sendBank(pid);
      return `You need at least ${fmtChips(min)} chips to sit at this table. You get more at midnight (UTC).`;
    }
    const err = this.table.sit(pid, name, amount);
    if (err) await bank.deposit(pid, amount); // the last seat went while we were at the bank
    await this.sendBank(pid);
    return err;
  }

  async sendBank(pid: string) {
    const balance = await bankOf(this.env).balance(pid);
    const msg = JSON.stringify({ type: 'bank', balance, refillsAt: nextRefill(Date.now()) });
    for (const c of this.getConnections()) if (this.pidOf(c) === pid) c.send(msg);
  }

  /** Send everyone their view, pay out anyone who stood up, save the seats, and set the next timer. */
  async update() {
    for (const c of this.getConnections()) {
      const pid = this.pidOf(c);
      if (pid) c.send(JSON.stringify(this.table.viewFor(pid)));
    }
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
    await this.ctx.storage.put(
      'seats',
      this.table.seats.map((s) => ({ id: s.id, stack: s.stack })),
    );
    for (const pid of new Set(outs.map((c) => c.id))) await this.sendBank(pid);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    // POST /bank with the player's key as the body: their chips, for the lobby
    if (new URL(request.url).pathname === '/bank' && request.method === 'POST') {
      const key = (await request.text()).trim();
      if (!KEY_PATTERN.test(key)) return Response.json({ error: 'bad key' }, { status: 400, headers: CORS });
      const balance = await bankOf(env).balance(await playerId(key));
      return Response.json({ balance, refillsAt: nextRefill(Date.now()) }, { headers: CORS });
    }
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
