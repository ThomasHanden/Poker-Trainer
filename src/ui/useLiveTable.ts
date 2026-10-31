// Connection to a live table on the Cloudflare table server (party/server.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import type { PlayerAction } from '../engine/rules';
import type { ClientMessage, ServerMessage, TableView } from '../multiplayer/table';

/** Address of the table server, e.g. felt-tables.<account>.workers.dev (set in .env.local / Vercel). */
export const PARTY_HOST: string | undefined = import.meta.env.VITE_PARTY_HOST || undefined;

export type LiveStatus = 'connecting' | 'open' | 'closed';

export interface Bankroll {
  balance: number;
  refillsAt: number;
}

const local = () => /^(localhost|127\.0\.0\.1)[:/]/.test(PARTY_HOST ?? '');
const httpBase = () => `${local() ? 'http' : 'https'}://${PARTY_HOST}`;

/** Plain HTTP address for a table's lobby summary (partysocket picks ws/wss the same way). */
export function tableInfoUrl(room: string): string {
  return `${httpBase()}/parties/poker-table/${encodeURIComponent(room)}`;
}

/**
 * Your secret player key: it stays in this browser and is what your chips belong to. Other players
 * only ever see a hash of it, so nobody can sit down as you. A private window gets a new key.
 */
export function playerKey(): string {
  try {
    let key = localStorage.getItem('live-key');
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem('live-key', key);
    }
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

const SAT_AT_KEY = 'live-sat-at';
const SAT_AT_DAYS = 3;

/** Remember a table you bought in at (see fetchBankroll). */
export function rememberTable(room: string) {
  try {
    const rows = (JSON.parse(localStorage.getItem(SAT_AT_KEY) ?? '[]') as [string, number][]).filter(([r]) => r !== room);
    localStorage.setItem(SAT_AT_KEY, JSON.stringify([[room, Date.now()], ...rows].slice(0, 10)));
  } catch {
    /* not remembered: only matters if that table restarts while nobody is there */
  }
}

/**
 * Your chips away from the tables, or null if the server cannot be reached. A table that restarted
 * pays its players back when it next starts, so first wake the tables you recently sat at.
 */
export async function fetchBankroll(): Promise<Bankroll | null> {
  try {
    const rows = (JSON.parse(localStorage.getItem(SAT_AT_KEY) ?? '[]') as [string, number][]).filter(([, at]) => Date.now() - at < SAT_AT_DAYS * 864e5);
    await Promise.all(rows.map(([room]) => fetch(tableInfoUrl(room)).catch(() => null)));
  } catch {
    /* nothing remembered */
  }
  try {
    // plain text body: a simple request, so the browser does not need a CORS preflight
    const r = await fetch(`${httpBase()}/bank`, { method: 'POST', body: playerKey(), headers: { 'Content-Type': 'text/plain' } });
    return r.ok ? ((await r.json()) as Bankroll) : null;
  } catch {
    return null;
  }
}

export function useLiveTable(room: string) {
  const [view, setView] = useState<TableView | null>(null);
  const [bank, setBank] = useState<Bankroll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  /** server clock minus ours, for countdowns */
  const [offset, setOffset] = useState(0);
  const ws = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!PARTY_HOST) return;
    const socket = new PartySocket({ host: PARTY_HOST, party: 'poker-table', room, query: { key: playerKey() } });
    socket.addEventListener('open', () => setStatus('open'));
    socket.addEventListener('close', () => setStatus('closed'));
    socket.addEventListener('message', (e) => {
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === 'error') {
        setError(m.message);
      } else if (m.type === 'bank') {
        setBank({ balance: m.balance, refillsAt: m.refillsAt });
      } else {
        setView(m);
        setOffset(m.now - Date.now());
      }
    });
    ws.current = socket;
    return () => {
      socket.close();
      ws.current = null;
    };
  }, [room]);

  const send = useCallback((m: ClientMessage) => {
    setError(null);
    ws.current?.send(JSON.stringify(m));
  }, []);

  return {
    view,
    bank,
    error,
    status,
    offset,
    sit: (name: string, buyIn?: number) => send({ type: 'sit', name, buyIn }),
    leave: () => send({ type: 'leave' }),
    start: () => send({ type: 'start' }),
    act: (action: PlayerAction) => send({ type: 'action', action }),
  };
}
