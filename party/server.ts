// Cloudflare table server. Each table code gets its own PokerTable instance (a Durable Object),
// which holds the game in memory and talks to the players over WebSockets.
// The game rules live in src/multiplayer/table.ts; this file only moves messages and runs the timer.

import { Server, routePartykitRequest, type Connection, type WSMessage } from 'partyserver';
import { LiveTable, isPublicTable } from '../src/multiplayer/table';

type Env = { PokerTable: DurableObjectNamespace<PokerTable> };

export class PokerTable extends Server<Env> {
  table = new LiveTable();
  timer: ReturnType<typeof setTimeout> | null = null;

  onStart() {
    this.table = new LiveTable({ autoDeal: isPublicTable(this.name) });
  }

  /** Plain GET: how full the table is, for the lobby. */
  onRequest() {
    return Response.json(this.table.summary(), {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    });
  }

  onConnect(conn: Connection) {
    this.table.setOnline(conn.id, true);
    this.update();
  }

  onMessage(conn: Connection, raw: WSMessage) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const err = this.table.handle(conn.id, msg);
    if (err) conn.send(JSON.stringify({ type: 'error', message: err }));
    this.update();
  }

  onClose(conn: Connection) {
    // A reload can open the new socket (same id) before the old one closes.
    const stillHere = [...this.getConnections()].some((c) => c.id === conn.id && c !== conn);
    if (!stillHere) this.table.setOnline(conn.id, false);
    this.update();
  }

  /** Send everyone their own view and set the timer for whatever the table does next. */
  update() {
    for (const c of this.getConnections()) c.send(JSON.stringify(this.table.viewFor(c.id)));
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const at = this.table.nextDeadline();
    if (at === null) return;
    this.timer = setTimeout(() => {
      this.table.tick();
      this.update();
    }, Math.max(0, at - Date.now()));
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
