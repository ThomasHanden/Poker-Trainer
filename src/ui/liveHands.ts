// Your live-table hands, kept in this browser (per account when signed in): every finished hand
// you were dealt into, as you saw it (your cards, and other players' only when they were shown).
// Used for the live hand history: replays, session stats and a text log you can download.

import type { HandState, RecordType, Street } from '../engine/rules';
import { cardToString } from '../engine/cards';
import { describeScore } from '../engine/evaluator';
import { currentOwner, ownedKey } from '../persistence/storage';
import { fmtChips, tableLabel } from '../multiplayer/table';

export interface LiveHand {
  /** room:handNo:startedAt, so the same hand is never kept twice */
  id: string;
  room: string;
  handNo: number;
  /** when it finished */
  at: number;
  /** your index in hand.players */
  me: number;
  hand: HandState;
}

const KEY = 'felt-school:live-hands';
const MAX = 1000;
/** Hands at one table this close together are one session. */
const SESSION_GAP_MS = 2 * 3600_000;

export function loadLiveHands(who: string | null = currentOwner()): LiveHand[] {
  try {
    const v = JSON.parse(localStorage.getItem(ownedKey(KEY, who)) ?? '[]');
    return Array.isArray(v) ? v.filter((h) => h && typeof h.id === 'string' && h.hand) : [];
  } catch {
    return [];
  }
}

/** Keep a finished hand; saving it again (cards shown afterwards) updates it. */
export function saveLiveHand(h: LiveHand) {
  const all = loadLiveHands();
  const k = all.findIndex((x) => x.id === h.id);
  if (k >= 0) {
    if (JSON.stringify(all[k].hand) === JSON.stringify(h.hand)) return;
    all[k] = { ...h, at: all[k].at };
  } else all.push(h);
  try {
    localStorage.setItem(ownedKey(KEY), JSON.stringify(all.slice(-MAX)));
  } catch {
    /* storage full or unavailable: this hand is not kept */
  }
}

export function clearLiveHands() {
  try {
    localStorage.removeItem(ownedKey(KEY));
  } catch {
    /* nothing kept */
  }
}

export interface Session {
  room: string;
  start: number;
  end: number;
  hands: LiveHand[];
}

/** Hands grouped into sessions (one table, no long break), newest first. */
export function sessions(hands: LiveHand[]): Session[] {
  const out: Session[] = [];
  for (const h of [...hands].sort((a, b) => a.at - b.at)) {
    const s = out.find((x) => x.room === h.room && h.at - x.end < SESSION_GAP_MS);
    if (s) {
      s.hands.push(h);
      s.end = h.at;
    } else out.push({ room: h.room, start: h.at, end: h.at, hands: [h] });
  }
  return out.reverse();
}

export interface LiveStats {
  hands: number;
  /** voluntarily put money in preflop (calls, bets, raises; not blinds), as a share of hands with a preflop round */
  vpip: number | null;
  /** raised preflop */
  pfr: number | null;
  /** chips won or lost, in table units */
  net: number;
  /** the biggest pot you won, in table units */
  biggest: number;
  /** hands won (any pot) */
  won: number;
}

const VOLUNTARY: RecordType[] = ['call', 'bet', 'raise'];

export function liveStats(hands: LiveHand[]): LiveStats {
  let vpip = 0;
  let pfr = 0;
  let preflop = 0;
  let net = 0;
  let biggest = 0;
  let won = 0;
  for (const { hand: h, me } of hands) {
    const mine = h.history.filter((r) => r.player === me && r.street === 'preflop');
    if (!h.bomb) {
      preflop++;
      if (mine.some((r) => VOLUNTARY.includes(r.type))) vpip++;
      if (mine.some((r) => r.type === 'raise' || r.type === 'bet')) pfr++;
    }
    const r = h.result;
    if (!r) continue;
    net += r.net[me] ?? 0;
    if ((r.payouts[me] ?? 0) > 0 && (r.net[me] ?? 0) > 0) {
      won++;
      biggest = Math.max(biggest, r.payouts[me]);
    }
  }
  return { hands: hands.length, vpip: preflop ? vpip / preflop : null, pfr: preflop ? pfr / preflop : null, net, biggest, won };
}

const STREET_NAME: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const cards = (cs: number[]) => cs.map(cardToString).join(' ');

/** One hand as plain text, for the download. */
export function handText(lh: LiveHand): string {
  const h = lh.hand;
  const name = (i: number) => (i === lh.me ? `${h.players[i].name} (you)` : h.players[i].name);
  const lines = [
    `Felt School hand #${lh.handNo} · ${tableLabel(lh.room)} · ${new Date(lh.at).toISOString().replace('T', ' ').slice(0, 19)} UTC${h.bomb ? ' · bomb pot' : ''}`,
    ...h.players.map((p, i) => `Seat ${p.position}: ${name(i)} (${fmtChips(p.startStack)})${p.hole.length === 2 ? ` [${cards(p.hole)}]` : ''}`),
  ];
  let street: Street | null = null;
  const boardAt: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
  for (const r of h.history) {
    if (r.street !== street) {
      street = r.street;
      lines.push(street === 'preflop' ? '*** Preflop ***' : `*** ${STREET_NAME[street]} *** [${cards(h.board.slice(0, boardAt[street]))}]`);
    }
    const who = name(r.player);
    const amt = fmtChips(r.to);
    const all = r.allIn ? ' (all-in)' : '';
    lines.push(
      r.type === 'post-sb'
        ? `${who} posts the small blind ${fmtChips(r.amount)}`
        : r.type === 'post-bb'
          ? `${who} posts the big blind ${fmtChips(r.amount)}`
          : r.type === 'post-ante'
            ? `${who} puts in ${fmtChips(r.amount)}`
            : r.type === 'post-straddle'
              ? `${who} straddles ${fmtChips(r.amount)}`
            : r.type === 'fold' || r.type === 'check'
              ? `${who} ${r.type}s`
              : r.type === 'call'
                ? `${who} calls ${fmtChips(r.amount)}${all}`
                : `${who} ${r.type === 'bet' ? 'bets' : 'raises to'} ${amt}${all}`,
    );
  }
  // a board run out after everyone was all-in comes after the last action
  if (h.board.length && street && boardAt[street] < h.board.length) lines.push(`*** ${h.board2 ? (h.runs ? 'Run 1' : 'Board 1') : 'Board'} *** [${cards(h.board)}]`);
  else if (h.board2) lines.push(`*** ${h.runs ? 'Run 1' : 'Board 1'} *** [${cards(h.board)}]`);
  if (h.board2) lines.push(`*** ${h.runs ? 'Run 2' : 'Board 2'} *** [${cards(h.board2)}]`);
  const res = h.result;
  if (res) {
    for (const pot of res.pots.filter((p) => p.eligible.length > 1 || res.reason === 'fold')) {
      const hand = pot.score !== undefined ? ` with ${describeScore(pot.score).toLowerCase()}` : '';
      const on = pot.board === undefined ? '' : ` on ${h.runs ? 'run' : 'board'} ${pot.board + 1}`;
      lines.push(`${pot.winners.map(name).join(' and ')} ${pot.winners.length > 1 ? 'split' : 'wins'} ${fmtChips(pot.amount)}${on}${hand}`);
    }
  }
  return lines.join('\n');
}

/** A whole session as text. */
export function sessionText(s: Session): string {
  return s.hands.map(handText).join('\n\n') + '\n';
}
