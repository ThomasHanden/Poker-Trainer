// Connection to a live table on the Cloudflare table server (party/server.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';
import type { PlayerAction } from '../engine/rules';
import { PUBLIC_TABLES, type ClientMessage, type ServerMessage, type TableSummary, type TableView } from '../multiplayer/table';
import type { BankStatus } from '../multiplayer/bank';
import type { ChatMessage } from '../multiplayer/chat';

/** Address of the table server, e.g. felt-tables.<account>.workers.dev (set in .env.local / Vercel). */
export const PARTY_HOST: string | undefined = import.meta.env.VITE_PARTY_HOST || undefined;

export type LiveStatus = 'connecting' | 'open' | 'closed';

/** Your chips away from the tables and today's claim (claimedToday is undefined from a server before claims). */
export type Bankroll = Pick<BankStatus, 'balance' | 'nextClaimAt'> & Partial<Pick<BankStatus, 'claimedToday' | 'claim' | 'guestMoved'>>;

/** A chat line as this page shows it: delivered, or one of yours still on its way or not delivered. */
export type ChatLine = ChatMessage & { state?: 'sending' | 'failed'; error?: string };

/** How long to wait for the server to confirm a message before calling it not delivered. */
const CHAT_ACK_MS = 8000;
/** How often the lobby rechecks how full the public tables are. */
export const LOBBY_POLL_MS = 10_000;

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

/** This browser's guest key if it has ever made one (signed-in players never need a new one). */
export function existingPlayerKey(): string | null {
  try {
    return localStorage.getItem('live-key');
  } catch {
    return null;
  }
}

/**
 * The signed-in account, if any (set by AuthProvider). Signed-in players play and bank under their
 * account: the server checks their access token. Guests use their browser key.
 */
let liveAccount: { id: string; token: () => Promise<string | null> } | null = null;
export function setLiveAccount(a: typeof liveAccount) {
  liveAccount = a;
}

/** The signed-in player's access token for the table server, or null for a guest. */
export async function accountToken(): Promise<string | null> {
  return liveAccount ? liveAccount.token() : null;
}

/** Who a bank request is from: the guest's key, or the signed-in player's access token. */
async function bankBody(): Promise<string> {
  if (liveAccount) {
    const token = await liveAccount.token();
    if (!token) throw new Error('Your sign-in has expired. Sign in again.');
    return JSON.stringify({ token });
  }
  return playerKey();
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
    const r = await fetch(`${httpBase()}/bank`, { method: 'POST', body: await bankBody(), headers: { 'Content-Type': 'text/plain' } });
    return r.ok ? toBankroll(await r.json()) : null;
  } catch {
    return null;
  }
}

function toBankroll(b: Bankroll & { refillsAt?: number }): Bankroll {
  return { balance: b.balance, nextClaimAt: b.nextClaimAt ?? b.refillsAt ?? 0, claimedToday: b.claimedToday, claim: b.claim, guestMoved: b.guestMoved };
}

/** The guest chips this browser holds (its key's bank), for offering to move them into an account. */
export async function fetchGuestBankroll(): Promise<Bankroll | null> {
  const key = existingPlayerKey();
  if (!key) return null;
  try {
    const r = await fetch(`${httpBase()}/bank`, { method: 'POST', body: key, headers: { 'Content-Type': 'text/plain' } });
    return r.ok ? toBankroll(await r.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Move this browser's guest chips into the signed-in account. The server moves only what it holds
 * for the guest key, once per account and once per guest wallet.
 */
export async function moveGuestChips(): Promise<{ moved: number; bank: Bankroll }> {
  const key = existingPlayerKey();
  const token = liveAccount ? await liveAccount.token() : null;
  if (!key || !token) throw new Error('Sign in first.');
  let r: Response;
  try {
    r = await fetch(`${httpBase()}/bank/move-guest`, { method: 'POST', body: JSON.stringify({ token, key }), headers: { 'Content-Type': 'text/plain' } });
  } catch {
    throw new Error('Could not reach the chip server. Check your connection and try again.');
  }
  const body = (await r.json().catch(() => ({}))) as { moved?: number; status?: Bankroll; error?: string };
  if (!r.ok || !body.status) throw new Error(body.error ?? 'The chips could not be moved. Try again.');
  return { moved: body.moved ?? 0, bank: toBankroll(body.status) };
}

/**
 * Claim today's chips. The server picks the amount and pays it at most once per UTC day; asking
 * again (a retry after a dropped connection) returns the same claim without paying twice.
 */
export async function claimDailyChips(): Promise<Bankroll & { amount: number }> {
  const once = async () => {
    const r = await fetch(`${httpBase()}/bank/claim`, { method: 'POST', body: await bankBody(), headers: { 'Content-Type': 'text/plain' } });
    if (!r.ok)
      throw new Error(
        r.status === 404 ? 'Daily chips are not switched on yet. Try again later.' : r.status === 401 ? 'Your sign-in could not be confirmed. Sign in again.' : 'The chip server did not accept the claim. Try again.',
      );
    const b = (await r.json()) as Bankroll & { amount: number };
    return { ...toBankroll(b), amount: b.amount };
  };
  try {
    return await once();
  } catch (e) {
    // a dropped connection: asking again is safe, it cannot pay twice
    if (e instanceof TypeError) return once().catch(() => Promise.reject(new Error('Could not reach the chip server. Check your connection and try again.')));
    throw e;
  }
}

/** "1 player · 3 bots · in a hand". Bots are counted separately, never as players. */
export function occupancy(s: TableSummary): string {
  const bots = s.bots ?? 0; // table servers from before bots leave it out
  if (!s.players && !bots) return 'empty';
  const parts = [`${s.players} ${s.players === 1 ? 'player' : 'players'}`];
  if (bots) parts.push(`${bots} ${bots === 1 ? 'bot' : 'bots'}`);
  if (s.playing) parts.push('in a hand');
  return parts.join(' · ');
}

/** How full each public table is, refreshed while the page is open and visible (and `enabled`). */
export function usePublicTables(enabled = true): Record<string, TableSummary | null | undefined> {
  const [info, setInfo] = useState<Record<string, TableSummary | null>>({});
  useEffect(() => {
    if (!PARTY_HOST || !enabled) return;
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      const rows = await Promise.all(
        PUBLIC_TABLES.map(async (room) => {
          try {
            const r = await fetch(tableInfoUrl(room));
            return [room, r.ok ? ((await r.json()) as TableSummary) : null] as const;
          } catch {
            return [room, null] as const;
          }
        }),
      );
      if (!stopped) setInfo(Object.fromEntries(rows));
    };
    load();
    const t = setInterval(load, LOBBY_POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, [enabled]);
  return info;
}

/** A live table, as the signed-in account (accountId) or as this browser's guest; switching reconnects. */
export function useLiveTable(room: string, accountId: string | null = null) {
  const [view, setView] = useState<TableView | null>(null);
  const [bank, setBank] = useState<Bankroll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  /** server clock minus ours, for countdowns */
  const [offset, setOffset] = useState(0);
  /** this table's chat, or null while you may not see it (not seated) */
  const [chat, setChat] = useState<ChatLine[] | null>(null);
  const ws = useRef<PartySocket | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!PARTY_HOST) return;
    // a new table: nothing from the last one may show here
    setChat(null);
    setView(null);
    setBank(null);
    let current = true;
    // chat=1: this page understands chat messages (the server sends none to pages that do not).
    // Signed in: auth=1, then the access token as the first message on every (re)connect, so it
    // is never part of an address.
    const query = accountId ? { auth: '1', chat: '1' } : { key: playerKey(), chat: '1' };
    const socket = new PartySocket({ host: PARTY_HOST, party: 'poker-table', room, query });
    socket.addEventListener('open', () => {
      if (!current) return;
      setStatus('open');
      if (!accountId) return;
      const account = liveAccount?.id === accountId ? liveAccount : null;
      void (account ? account.token() : Promise.resolve(null)).then((token) => {
        if (!current) return;
        if (token) socket.send(JSON.stringify({ type: 'auth', token }));
        else setError('Your sign-in has expired. Sign in again to play under your account.');
      });
    });
    socket.addEventListener('close', () => current && setStatus('closed'));
    socket.addEventListener('message', (e) => {
      if (!current) return;
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === 'error' || m.type === 'auth-error') {
        setError(m.message);
      } else if (m.type === 'bank') {
        setBank(toBankroll(m));
      } else if (m.type === 'chat-history') {
        // the whole history (after sitting down or reconnecting): replaces what we had, keeping
        // only our own messages the server has not confirmed yet
        setChat((old) => [...m.messages, ...(old ?? []).filter((l) => l.state && !m.messages.some((x) => x.cid === l.cid))]);
      } else if (m.type === 'chat') {
        const msg = m.message;
        if (msg.cid) clearTimeout(timers.current.get(msg.cid));
        setChat((old) => {
          const lines = old ?? [];
          if (lines.some((l) => l.id === msg.id && !l.state)) return lines; // already have it
          const mine = lines.findIndex((l) => l.state && l.cid === msg.cid);
          return mine >= 0 ? lines.map((l, i) => (i === mine ? msg : l)) : [...lines, msg];
        });
      } else if (m.type === 'chat-error') {
        clearTimeout(timers.current.get(m.cid));
        setChat((old) => old && old.map((l) => (l.state && l.cid === m.cid ? { ...l, state: 'failed', error: m.message } : l)));
      } else if (m.type === 'chat-closed') {
        setChat(null);
      } else {
        setView(m);
        setOffset(m.now - Date.now());
      }
    });
    ws.current = socket;
    const pending = timers.current;
    return () => {
      current = false;
      socket.close();
      ws.current = null;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, [room, accountId]);

  const send = useCallback((m: ClientMessage) => {
    setError(null);
    ws.current?.send(JSON.stringify(m));
  }, []);

  /** Send a chat line (or send a failed one again: same cid, so it can never post twice). */
  const sendChat = useCallback((text: string, retryCid?: string) => {
    const cid = retryCid ?? crypto.randomUUID();
    const line: ChatLine = { id: -1, kind: 'player', from: '', text, at: Date.now(), cid, state: 'sending' };
    setChat((old) => (old ? (retryCid ? old.map((l) => (l.cid === cid ? line : l)) : [...old, line]) : old));
    ws.current?.send(JSON.stringify({ type: 'chat', cid, text } satisfies ClientMessage));
    clearTimeout(timers.current.get(cid));
    timers.current.set(
      cid,
      setTimeout(() => setChat((old) => old && old.map((l) => (l.state === 'sending' && l.cid === cid ? { ...l, state: 'failed', error: 'Not delivered' } : l))), CHAT_ACK_MS),
    );
  }, []);

  return {
    view,
    bank,
    setBank,
    error,
    status,
    offset,
    chat,
    sendChat,
    sit: (name: string, seat: number, buyIn: number) => send({ type: 'sit', name, seat, buyIn }),
    leave: () => send({ type: 'leave' }),
    start: () => send({ type: 'start' }),
    act: (action: PlayerAction) => send({ type: 'action', action }),
  };
}
