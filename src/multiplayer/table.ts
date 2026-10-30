// Live multiplayer table: seats, the button, turn timers and what each player is allowed to see.
// Runs on the Cloudflare table server (party/server.ts). It has no Cloudflare dependencies so it
// can be unit tested; the server only passes messages in and sends views out.

import { fullDeck } from '../engine/cards';
import { applyAction, buttonIndexFor, forfeit, legalActions, newHand, validateAction, type HandState, type PlayerAction } from '../engine/rules';

export const SB = 1;
export const BB = 2;
export const START_STACK = 200; // 100bb
export const MAX_SEATS = 6;
export const NAME_MAX = 12;
export const TURN_MS = 30_000;
/** Turn time for a player who has disconnected or left mid-hand. */
export const AWAY_TURN_MS = 3_000;
export const NEXT_HAND_MS = 6_000;
/** How long a seat is held for a player who dropped between hands (long enough for a reload). */
export const RECONNECT_MS = 20_000;
/** Timed-out turns in a row before a player is stood up. */
export const MAX_TIMEOUTS = 2;

/** Always-open tables anyone can join from the lobby; hands deal themselves. */
export const PUBLIC_TABLES = ['public-1', 'public-2', 'public-3', 'public-4'];
export const isPublicTable = (room: string) => PUBLIC_TABLES.includes(room);
export const STAKES = `${SB}/${BB} NLH`;
export const tableLabel = (room: string) => (isPublicTable(room) ? `${STAKES} #${room.slice('public-'.length)}` : `${STAKES} · ${room}`);

export type ClientMessage =
  | { type: 'sit'; name: string }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'action'; action: PlayerAction };

export interface SeatView {
  id: string;
  name: string;
  stack: number;
  /** disconnected */
  away: boolean;
  /** standing up when the current hand ends */
  leaving: boolean;
  /** dealt into the current hand */
  playing: boolean;
}

export interface TableView {
  type: 'state';
  you: string;
  seats: SeatView[];
  maxSeats: number;
  /** hands deal themselves (public tables); otherwise someone presses Deal for the first hand */
  autoDeal: boolean;
  /** the current (or last finished) hand, with the deck and other players' cards removed */
  hand: HandState | null;
  /** the viewer's index in hand.players, or -1 when not in the hand */
  me: number;
  handNo: number;
  turnEndsAt: number | null;
  nextHandAt: number | null;
  /** server clock when this view was made, for countdowns */
  now: number;
}

export type ServerMessage = TableView | { type: 'error'; message: string };

/** What the lobby shows for a table. */
export interface TableSummary {
  players: number;
  maxSeats: number;
  playing: boolean;
}

interface Seat {
  id: string;
  name: string;
  stack: number;
  leaving: boolean;
  /** when the player's connection dropped, or null while connected */
  offlineSince: number | null;
  timeouts: number;
}

const ACTION_TYPES = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];

/** Messages come from browsers, so check their shape before using them. */
function cleanAction(a: unknown): PlayerAction | null {
  if (!a || typeof a !== 'object') return null;
  const { type, to } = a as Record<string, unknown>;
  if (typeof type !== 'string' || !ACTION_TYPES.includes(type)) return null;
  if (to !== undefined && !Number.isInteger(to)) return null;
  return to === undefined ? { type: type as PlayerAction['type'] } : { type: type as PlayerAction['type'], to: to as number };
}

export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
  return s || 'Player';
}

// The app's seeded RNG is repeatable by design, so it is predictable; real deals use crypto.
function shuffle<T>(a: T[]): T[] {
  const r = new Uint32Array(a.length);
  crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface LiveTableOptions {
  autoDeal?: boolean;
  clock?: () => number;
  shuffleDeck?: <T>(a: T[]) => T[];
}

export class LiveTable {
  seats: Seat[] = []; // clockwise
  hand: HandState | null = null;
  /** seat id for each hand.players index */
  order: string[] = [];
  handNo = 0;
  turnEndsAt: number | null = null;
  nextHandAt: number | null = null;
  readonly autoDeal: boolean;
  private button = 0; // index into seats
  private settled = 0; // handNo of the last hand whose result was paid out
  private clock: () => number;
  private shuffleDeck: <T>(a: T[]) => T[];

  constructor(opts: LiveTableOptions = {}) {
    this.autoDeal = opts.autoDeal ?? false;
    this.clock = opts.clock ?? Date.now;
    this.shuffleDeck = opts.shuffleDeck ?? shuffle;
  }

  inHand(): boolean {
    return !!this.hand && !this.hand.complete;
  }

  /** Apply one message from a player. Returns an error to show them, or null. */
  handle(id: string, msg: unknown): string | null {
    if (!msg || typeof msg !== 'object') return 'Bad message';
    const m = msg as Record<string, unknown>;
    switch (m.type) {
      case 'sit':
        return this.sit(id, cleanName(m.name));
      case 'leave':
        this.leave(id);
        return null;
      case 'start':
        return this.start();
      case 'action': {
        const a = cleanAction(m.action);
        if (!a) return 'Bad action';
        const err = this.act(id, a);
        const seat = this.seatOf(id);
        if (!err && seat) seat.timeouts = 0;
        return err;
      }
      default:
        return 'Unknown message';
    }
  }

  setOnline(id: string, on: boolean) {
    const seat = this.seatOf(id);
    if (!seat) return;
    if (on) {
      seat.offlineSince = null;
    } else {
      seat.offlineSince ??= this.clock();
      this.hurryIfToAct(id);
    }
    this.refreshNextHand();
  }

  summary(): TableSummary {
    return { players: this.seats.length, maxSeats: MAX_SEATS, playing: this.inHand() };
  }

  sit(id: string, name: string): string | null {
    const seat = this.seatOf(id);
    if (seat) {
      seat.name = name;
      seat.leaving = false;
      seat.offlineSince = null;
    } else {
      if (this.seats.length >= MAX_SEATS) return 'The table is full';
      this.seats.push({ id, name, stack: START_STACK, leaving: false, offlineSince: null, timeouts: 0 });
    }
    this.refreshNextHand();
    return null;
  }

  leave(id: string) {
    const seat = this.seatOf(id);
    if (!seat) return;
    const k = this.order.indexOf(id);
    seat.leaving = true;
    if (this.inHand() && k >= 0) this.forfeitSeat(id);
    // an all-in player's hand plays on to showdown; they stand up when it ends
    if (!(this.inHand() && k >= 0 && !this.hand!.players[k].folded)) this.removeSeat(id);
  }

  start(): string | null {
    if (this.inHand()) return 'A hand is already being played';
    this.nextHandAt = null;
    for (const s of [...this.seats]) if (s.leaving || s.offlineSince !== null) this.removeSeat(s.id);
    const n = this.seats.length;
    if (n < 2) return 'You need at least two players';
    // players[] runs UTG ... BTN, SB, BB (clockwise); rotate the seats so the button seat lands on BTN.
    const btn = buttonIndexFor(n);
    const ordered = Array.from({ length: n }, (_, i) => this.seats[(this.button + i - btn + n) % n]);
    const deck = this.shuffleDeck(fullDeck());
    const holes = ordered.map(() => [deck.pop()!, deck.pop()!]);
    this.order = ordered.map((s) => s.id);
    this.hand = newHand({
      config: { format: 'cash', numPlayers: n, sb: SB, bb: BB, ante: 0, anteType: 'none' },
      stacks: ordered.map((s) => s.stack),
      heroIndex: -1,
      holes,
      deckOrder: deck,
      names: ordered.map((s) => s.name),
    });
    this.handNo++;
    this.afterChange();
    return null;
  }

  act(id: string, action: PlayerAction): string | null {
    const h = this.hand;
    if (!h || h.complete) return 'No hand is being played';
    if (this.order[h.toAct] !== id) return 'It is not your turn';
    const err = validateAction(h, action);
    if (err) return err;
    this.hand = applyAction(h, action);
    this.afterChange();
    return null;
  }

  /** The next time tick() has work to do, or null. */
  nextDeadline(): number | null {
    if (this.inHand()) return this.turnEndsAt;
    const times = [this.nextHandAt, ...this.seats.map((s) => (s.offlineSince === null ? null : s.offlineSince + RECONNECT_MS))];
    const due = times.filter((t): t is number => t !== null);
    return due.length ? Math.min(...due) : null;
  }

  /** Run whatever is due: an expired turn, a dropped player's seat, or the next deal. Returns true if anything changed. */
  tick(): boolean {
    const now = this.clock();
    const h = this.hand;
    if (h && !h.complete) {
      if (this.turnEndsAt === null || now < this.turnEndsAt) return false;
      const id = this.order[h.toAct];
      const seat = this.seatOf(id);
      if (seat && !seat.leaving && seat.offlineSince === null && ++seat.timeouts >= MAX_TIMEOUTS) seat.leaving = true;
      this.autoAct(id);
      return true;
    }
    let changed = false;
    for (const s of [...this.seats]) {
      if (s.offlineSince !== null && now >= s.offlineSince + RECONNECT_MS) {
        this.removeSeat(s.id);
        changed = true;
      }
    }
    if (this.nextHandAt !== null && now >= this.nextHandAt) {
      this.start();
      changed = true;
    }
    return changed;
  }

  /** What one player is allowed to see. Never includes the deck or other players' cards. */
  viewFor(id: string): TableView {
    const h = this.hand;
    const shown = new Set(h?.complete && h.result?.reason === 'showdown' ? h.result.showdownPlayers : []);
    return {
      type: 'state',
      you: id,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        stack: s.stack,
        away: s.offlineSince !== null,
        leaving: s.leaving,
        playing: this.inHand() && this.order.includes(s.id),
      })),
      maxSeats: MAX_SEATS,
      autoDeal: this.autoDeal,
      hand: h && {
        ...h,
        deck: [],
        players: h.players.map((p, i) => ({
          ...p,
          isHero: this.order[i] === id,
          hole: this.order[i] === id || shown.has(i) ? p.hole : [],
        })),
      },
      me: h ? this.order.indexOf(id) : -1,
      handNo: this.handNo,
      turnEndsAt: this.inHand() ? this.turnEndsAt : null,
      nextHandAt: this.nextHandAt,
      now: this.clock(),
    };
  }

  /** Act for a player who is out of time: check when free, otherwise fold. Players who have gone are folded. */
  private autoAct(id: string) {
    const seat = this.seatOf(id);
    if ((!seat || seat.leaving || seat.offlineSince !== null) && this.forfeitSeat(id)) return;
    const la = legalActions(this.hand!);
    const tries: PlayerAction['type'][] = la?.canCheck ? ['check', 'fold'] : ['fold', 'check'];
    if (tries.every((type) => this.act(id, { type }) !== null)) this.turnEndsAt = null; // should not happen; avoid a timer loop
  }

  /** Fold a departed player's hand, in or out of turn. Returns false if it could not be folded (all-in). */
  private forfeitSeat(id: string): boolean {
    const next = forfeit(this.hand!, this.order.indexOf(id));
    if (next === this.hand) return false;
    this.hand = next;
    this.afterChange();
    return true;
  }

  private afterChange() {
    const h = this.hand!;
    if (h.complete) {
      if (this.settled !== this.handNo) this.finishHand();
      return;
    }
    const seat = this.seatOf(this.order[h.toAct]);
    const away = !seat || seat.leaving || seat.offlineSince !== null;
    this.turnEndsAt = this.clock() + (away ? AWAY_TURN_MS : TURN_MS);
  }

  private finishHand() {
    const h = this.hand!;
    this.settled = this.handNo;
    this.turnEndsAt = null;
    h.players.forEach((p, i) => {
      const seat = this.seatOf(this.order[i]);
      if (seat) seat.stack = p.stack > 0 ? p.stack : START_STACK; // free rebuy when busted
    });
    if (this.seats.length) this.button = (this.button + 1) % this.seats.length;
    for (const s of this.seats.filter((x) => x.leaving)) this.removeSeat(s.id);
    this.refreshNextHand();
  }

  /** Schedule or cancel the next deal to match who is at the table. */
  private refreshNextHand() {
    if (this.inHand()) return;
    const ready = this.seats.filter((s) => !s.leaving && s.offlineSince === null).length;
    if (ready < 2) this.nextHandAt = null;
    else if (this.nextHandAt === null && (this.hand || this.autoDeal)) this.nextHandAt = this.clock() + NEXT_HAND_MS;
  }

  private hurryIfToAct(id: string) {
    const h = this.hand;
    if (h && !h.complete && this.order[h.toAct] === id && this.turnEndsAt !== null) {
      this.turnEndsAt = Math.min(this.turnEndsAt, this.clock() + AWAY_TURN_MS);
    }
  }

  private removeSeat(id: string) {
    const k = this.seats.findIndex((s) => s.id === id);
    if (k < 0) return;
    this.seats.splice(k, 1);
    // keep the button on the same player when someone before it leaves
    if (k < this.button) this.button--;
    if (this.button >= this.seats.length) this.button = 0;
    this.refreshNextHand();
  }

  private seatOf(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }
}
