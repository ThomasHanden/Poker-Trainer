// Connection to a live table on the Cloudflare table server (party/server.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import type { PlayerAction } from '../engine/rules';
import type { ClientMessage, ServerMessage, TableView } from '../multiplayer/table';

/** Address of the table server, e.g. felt-tables.<account>.workers.dev (set in .env.local / Vercel). */
export const PARTY_HOST: string | undefined = import.meta.env.VITE_PARTY_HOST || undefined;

export type LiveStatus = 'connecting' | 'open' | 'closed';

/** One id per browser tab, kept across reloads so a refresh keeps your seat. */
function tabId(): string {
  try {
    let id = sessionStorage.getItem('live-id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('live-id', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function useLiveTable(room: string) {
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  /** server clock minus ours, for countdowns */
  const [offset, setOffset] = useState(0);
  const ws = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!PARTY_HOST) return;
    const socket = new PartySocket({ host: PARTY_HOST, party: 'poker-table', room, id: tabId() });
    socket.addEventListener('open', () => setStatus('open'));
    socket.addEventListener('close', () => setStatus('closed'));
    socket.addEventListener('message', (e) => {
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === 'error') {
        setError(m.message);
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
    error,
    status,
    offset,
    sit: (name: string) => send({ type: 'sit', name }),
    leave: () => send({ type: 'leave' }),
    start: () => send({ type: 'start' }),
    act: (action: PlayerAction) => send({ type: 'action', action }),
  };
}
