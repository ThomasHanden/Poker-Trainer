// Live multiplayer table: seats, the button, turn timers and what each player is allowed to see.
// Runs on the Cloudflare table server (party/server.ts). It has no Cloudflare dependencies so it
// can be unit tested; the server only passes messages in and sends views out.

import { fullDeck } from '../engine/cards';
import { applyAction, buttonIndexFor, forfeit, legalActions, newHand, validateAction, type HandState, type PlayerAction } from '../engine/rules';
import type { ProfileId } from '../opponents/profiles';
import { BOT_BUY_IN_BB, BOT_PREFIX, BOT_STYLES, BOT_THINK_MS, botStyleName, botView, practicePolicy, type BotPolicy } from './bots';

/**
 * Live tables count in half-chips so 0.5/1 blinds are whole numbers for the engine: every amount
 * on a live table (stacks, bets, the bank) is in these units, shown to players divided by CHIP.
 */
export const CHIP = 2;
export interface Stakes {
  sb: number;
  bb: number;
  /** blinds as players see them, e.g. "0.5/1" */
  label: string;
}
export const LOW_STAKES: Stakes = { sb: 1, bb: 2, label: '0.5/1' };
export const HIGH_STAKES: Stakes = { sb: 2, bb: 4, label: '1/2' };
/** Buy-ins: players choose an amount between these, in big blinds. */
export const MAX_BUY_IN_BB = 150;
export const MIN_BUY_IN_BB = 30;
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
/**
 * Public tables: while at least one person is seated, bots fill open seats until this many are
 * taken. People always come first: bots stand up between hands to make room. The table server
 * can change it with its BOT_SEATS setting.
 */
export const BOT_SEATS = 4;
/** Longest anyone waits for a bot's seat before the request lapses and their buy-in goes back. */
export const RESERVE_MS = 10 * 60_000;

/** Always-open tables anyone can join from the lobby; hands deal themselves. Half play 0.5/1, half 1/2. */
export const PUBLIC_TABLES = ['public-1', 'public-2', 'public-3', 'public-4'];
const HIGH_PUBLIC = ['public-3', 'public-4'];
export const isPublicTable = (room: string) => PUBLIC_TABLES.includes(room);
/** Private tables at 1/2 have codes starting "hi-"; all others play 0.5/1. */
export const HIGH_PREFIX = 'hi-';
export const stakesFor = (room: string): Stakes => (HIGH_PUBLIC.includes(room) || room.startsWith(HIGH_PREFIX) ? HIGH_STAKES : LOW_STAKES);
export const tableLabel = (room: string) => {
  const name = `${stakesFor(room).label} NLH`;
  return isPublicTable(room) ? `${name} #${room.slice('public-'.length)}` : `${name} · ${room.replace(HIGH_PREFIX, '')}`;
};
export const buyInFor = (st: Stakes) => ({ min: MIN_BUY_IN_BB * st.bb, max: MAX_BUY_IN_BB * st.bb });

/** The buy-in a player asked for, if it is a whole number of chips inside the table's range; otherwise null. */
export function checkBuyIn(st: Stakes, requested: unknown): number | null {
  const { min, max } = buyInFor(st);
  if (typeof requested !== 'number' || !Number.isInteger(requested) || requested % CHIP !== 0) return null;
  return requested >= min && requested <= max ? requested : null;
}

/** An amount in table units as chips, e.g. 1 → "0.5", 2500 → "1,250". */
export function fmtChips(units: number): string {
  return (units / CHIP).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Chips a player takes back to their bank when they stand up. */
export interface Cashout {
  id: string;
  amount: number;
}

export type ClientMessage =
  /** seat: which seat (0 to MAX_SEATS - 1); buyIn: chips to bring, in table units (both ignored when already seated) */
  | { type: 'sit'; name: string; seat?: number; buyIn?: number }
  /** stand up, or stop waiting for a bot's seat */
  | { type: 'leave' }
  /** stop waiting for a bot's seat (the buy-in goes back to the bank) */
  | { type: 'cancel' }
  | { type: 'start' }
  | { type: 'action'; action: PlayerAction };

export interface SeatView {
  id: string;
  /** fixed seat number around the table, 0 to MAX_SEATS - 1 */
  seat: number;
  name: string;
  stack: number;
  /** disconnected */
  away: boolean;
  /** standing up when the current hand ends */
  leaving: boolean;
  /** dealt into the current hand */
  playing: boolean;
  /** a bot's style, e.g. "TAG", or null for a person */
  bot: string | null;
  /** a bot whose seat someone is waiting to take when this hand ends */
  reserved: boolean;
}

export interface TableView {
  type: 'state';
  you: string;
  seats: SeatView[];
  maxSeats: number;
  /** hands deal themselves (public tables); otherwise someone presses Deal for the first hand */
  autoDeal: boolean;
  /** bots fill open seats up to this many players while someone is seated; 0 = no bots */
  botSeats: number;
  /** the bot's seat the viewer is waiting to take, and the buy-in set aside for it */
  waiting: { seat: number; buyIn: number } | null;
  stakes: Stakes;
  /** the current (or last finished) hand, with the deck and other players' cards removed */
  hand: HandState | null;
  /** the viewer's index in hand.players, or -1 when not in the hand */
  me: number;
  /** seat number and player id for each hand.players index (who was dealt in, and where) */
  handSeats: number[];
  handIds: string[];
  handNo: number;
  turnEndsAt: number | null;
  nextHandAt: number | null;
  /** server clock when this view was made, for countdowns */
  now: number;
}

export type ServerMessage =
  | TableView
  | { type: 'error'; message: string }
  /** the viewer's chips away from the table, and when they next refill */
  | { type: 'bank'; balance: number; refillsAt: number };

/** What the lobby shows for a table. */
export interface TableSummary {
  /** people only: bots are never counted here */
  players: number;
  bots: number;
  maxSeats: number;
  playing: boolean;
}

interface Seat {
  id: string;
  seat: number;
  name: string;
  stack: number;
  leaving: boolean;
  /** when the player's connection dropped, or null while connected */
  offlineSince: number | null;
  timeouts: number;
  /** a bot's playing style; people have none */
  bot?: ProfileId;
  /** someone waiting to take this bot's seat when the current hand ends */
  reservedBy?: Reservation;
}

/** A person waiting for a bot's seat, with their buy-in already drawn from the bank. */
interface Reservation {
  id: string;
  name: string;
  buyIn: number;
  at: number;
  offlineSince: number | null;
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
  stakes?: Stakes;
  autoDeal?: boolean;
  clock?: () => number;
  shuffleDeck?: <T>(a: T[]) => T[];
  /** fill open seats with bots up to this many players (see BOT_SEATS); default 0, no bots */
  botSeats?: number;
  /** what bots do; tests swap it to check what bots are shown */
  botPolicy?: BotPolicy;
  /** a number in [0, 1) for bot choices and thinking time */
  random?: () => number;
}

function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

export class LiveTable {
  seats: Seat[] = []; // clockwise
  hand: HandState | null = null;
  /** seat id for each hand.players index */
  order: string[] = [];
  handNo = 0;
  turnEndsAt: number | null = null;
  nextHandAt: number | null = null;
  /** when the bot to act makes its move */
  botAt: number | null = null;
  readonly autoDeal: boolean;
  readonly stakes: Stakes;
  readonly botSeats: number;
  /** the next hand's button goes to the first occupied seat at or after this seat number */
  private buttonSeat = 0;
  private handSeats: number[] = [];
  private settled = 0; // handNo of the last hand whose result was paid out
  private clock: () => number;
  private shuffleDeck: <T>(a: T[]) => T[];
  private cashouts: Cashout[] = [];
  private botPolicy: BotPolicy;
  private random: () => number;
  private botsMade = 0;

  constructor(opts: LiveTableOptions = {}) {
    this.stakes = opts.stakes ?? LOW_STAKES;
    this.autoDeal = opts.autoDeal ?? true;
    this.clock = opts.clock ?? Date.now;
    this.shuffleDeck = opts.shuffleDeck ?? shuffle;
    this.botSeats = Math.max(0, Math.min(MAX_SEATS, Math.floor(opts.botSeats ?? 0)));
    this.botPolicy = opts.botPolicy ?? practicePolicy;
    this.random = opts.random ?? cryptoRandom;
  }

  inHand(): boolean {
    return !!this.hand && !this.hand.complete;
  }

  isSeated(id: string): boolean {
    return !!this.seatOf(id);
  }

  /** The bot's seat this person is waiting for, if any. */
  reservationOf(id: string): { seat: number; buyIn: number } | null {
    const s = this.seats.find((x) => x.reservedBy?.id === id);
    return s ? { seat: s.seat, buyIn: s.reservedBy!.buyIn } : null;
  }

  /** Chips the table holds for people (stacks, and buy-ins set aside for a bot's seat); bots' chips are not anyone's. */
  heldChips(): Cashout[] {
    const out: Cashout[] = [];
    for (const s of this.seats) {
      if (!s.bot) out.push({ id: s.id, amount: s.stack });
      else if (s.reservedBy) out.push({ id: s.reservedBy.id, amount: s.reservedBy.buyIn });
    }
    return out;
  }

  /** Chips owed to players who stood up since the last call; the server pays them into the bank. */
  takeCashouts(): Cashout[] {
    const out = this.cashouts.filter((c) => c.amount > 0);
    this.cashouts = [];
    return out;
  }

  /**
   * Apply one message from a player. Returns an error to show them, or null. Sitting down is
   * handled by the server, since buying in has to wait for the bank.
   */
  handle(id: string, msg: unknown): string | null {
    if (!msg || typeof msg !== 'object') return 'Bad message';
    const m = msg as Record<string, unknown>;
    switch (m.type) {
      case 'leave':
        this.leave(id);
        return null;
      case 'cancel':
        this.cancelReservation(id);
        this.refreshNextHand();
        return null;
      case 'start':
        // only someone playing can deal early (it also stands up anyone away)
        return this.seatOf(id)?.bot === undefined && this.isSeated(id) ? this.start() : 'Sit down first';
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
    const r = this.seats.find((s) => s.reservedBy?.id === id)?.reservedBy;
    if (r) r.offlineSince = on ? null : (r.offlineSince ?? this.clock());
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
    const bots = this.seats.filter((s) => s.bot).length;
    return { players: this.seats.length - bots, bots, maxSeats: MAX_SEATS, playing: this.inHand() };
  }

  /** Why a player cannot take this seat, or null if they can: it is empty, or a bot holds it for them. */
  seatProblem(seatNo: unknown): string | null {
    // a bot's seat still counts as one you can have
    if (this.seats.length >= MAX_SEATS && this.seats.every((x) => !x.bot || x.reservedBy)) return 'The table is full';
    if (typeof seatNo !== 'number' || !Number.isInteger(seatNo) || seatNo < 0 || seatNo >= MAX_SEATS) return 'Pick a seat';
    const s = this.seats.find((x) => x.seat === seatNo);
    if (s && !s.bot) return 'Someone just took that seat. Pick another one.';
    if (s?.reservedBy) return 'Someone is already waiting for that seat. Pick another one.';
    return null;
  }

  /**
   * Take a seat with a buy-in already drawn from the bank, or (already seated or waiting) change name
   * and stay. A bot's seat is taken between hands: during a hand the bot plays it out first.
   */
  sit(id: string, name: string, buyIn = 0, seatNo?: number): string | null {
    const seat = this.seatOf(id);
    const waiting = this.seats.find((s) => s.reservedBy?.id === id)?.reservedBy;
    if (seat || waiting) {
      // a second buy-in for the same player is refused, so the server hands it back
      if (buyIn > 0) return seat ? 'You are already sitting at this table' : 'You are already waiting for a seat';
      if (waiting) waiting.name = name;
      if (seat) {
        seat.name = name;
        seat.leaving = false;
        seat.offlineSince = null;
      }
    } else {
      const chosen = seatNo ?? this.firstFreeSeat();
      const problem = this.seatProblem(chosen);
      if (problem) return problem;
      if (buyIn <= 0) return 'You need chips to sit down';
      const bot = this.seats.find((s) => s.seat === chosen);
      if (bot) {
        bot.reservedBy = { id, name, buyIn, at: this.clock(), offlineSince: null };
      } else {
        this.seats.push({ id, seat: chosen, name, stack: buyIn, leaving: false, offlineSince: null, timeouts: 0 });
        this.seats.sort((a, b) => a.seat - b.seat); // clockwise by seat number
      }
    }
    this.settleSeats();
    this.refreshNextHand();
    return null;
  }

  leave(id: string) {
    if (this.cancelReservation(id)) return this.refreshNextHand();
    const seat = this.seatOf(id);
    if (!seat) return;
    const k = this.order.indexOf(id);
    seat.leaving = true;
    if (this.inHand() && k >= 0) this.forfeitSeat(id);
    // an all-in player's hand plays on to showdown; they stand up when it ends
    if (!(this.inHand() && k >= 0 && !this.hand!.players[k].folded)) this.removeSeat(id);
    this.settleSeats();
    this.refreshNextHand();
  }

  start(): string | null {
    if (this.inHand()) return 'A hand is already being played';
    this.nextHandAt = null;
    for (const s of [...this.seats]) if (s.leaving || s.offlineSince !== null) this.removeSeat(s.id);
    this.settleSeats();
    const n = this.seats.length;
    if (n < 2) return 'You need at least two players';
    // bots never play a hand by themselves
    if (this.seats.every((s) => s.bot)) return 'You need at least two players';
    // the button goes to the first occupied seat at or after buttonSeat, going clockwise
    const button = Math.max(0, this.seats.findIndex((s) => s.seat >= this.buttonSeat));
    // players[] runs UTG ... BTN, SB, BB (clockwise); rotate the seats so the button seat lands on BTN.
    const btn = buttonIndexFor(n);
    const ordered = Array.from({ length: n }, (_, i) => this.seats[(button + i - btn + n) % n]);
    this.handSeats = ordered.map((s) => s.seat);
    const deck = this.shuffleDeck(fullDeck());
    const holes = ordered.map(() => [deck.pop()!, deck.pop()!]);
    this.order = ordered.map((s) => s.id);
    this.hand = newHand({
      config: { format: 'cash', numPlayers: n, sb: this.stakes.sb, bb: this.stakes.bb, ante: 0, anteType: 'none' },
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
    const waits = this.seats.flatMap((s) => (s.reservedBy ? [reservationLapses(s.reservedBy)] : []));
    const times = this.inHand()
      ? [this.turnEndsAt, this.botAt, ...waits]
      : [this.nextHandAt, ...waits, ...this.seats.map((s) => (s.offlineSince === null ? null : s.offlineSince + RECONNECT_MS))];
    const due = times.filter((t): t is number => t !== null);
    return due.length ? Math.min(...due) : null;
  }

  /**
   * Run whatever is due: a bot's move, an expired turn, a lapsed wait for a seat, a dropped player's
   * seat, or the next deal. Returns true if anything changed.
   */
  tick(): boolean {
    const now = this.clock();
    let lapsed = false;
    for (const s of this.seats) {
      if (s.reservedBy && now >= reservationLapses(s.reservedBy)) lapsed = this.cancelReservation(s.reservedBy.id);
    }
    if (lapsed) this.refreshNextHand();
    const h = this.hand;
    if (h && !h.complete) {
      // the move is tied to this exact turn: anything that changes the hand reschedules or clears it
      if (this.botAt !== null && now >= this.botAt) {
        this.botAct();
        return true;
      }
      if (this.turnEndsAt === null || now < this.turnEndsAt) return lapsed;
      const id = this.order[h.toAct];
      const seat = this.seatOf(id);
      if (seat && !seat.leaving && seat.offlineSince === null && ++seat.timeouts >= MAX_TIMEOUTS) seat.leaving = true;
      this.autoAct(id);
      return true;
    }
    let changed = lapsed;
    for (const s of [...this.seats]) {
      if (s.offlineSince !== null && now >= s.offlineSince + RECONNECT_MS) {
        this.removeSeat(s.id);
        changed = true;
      }
    }
    if (changed) {
      this.settleSeats();
      this.refreshNextHand();
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
        seat: s.seat,
        name: s.name,
        stack: s.stack,
        away: s.offlineSince !== null,
        leaving: s.leaving,
        playing: this.inHand() && this.order.includes(s.id),
        bot: s.bot ? botStyleName(s.bot) : null,
        reserved: !!s.reservedBy,
      })),
      maxSeats: MAX_SEATS,
      autoDeal: this.autoDeal,
      botSeats: this.botSeats,
      waiting: this.reservationOf(id),
      stakes: this.stakes,
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
      handSeats: h ? this.handSeats : [],
      handIds: h ? this.order : [],
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
    this.botAt = null;
    if (h.complete) {
      if (this.settled !== this.handNo) this.finishHand();
      return;
    }
    const seat = this.seatOf(this.order[h.toAct]);
    const away = !seat || (seat.leaving && !seat.bot) || seat.offlineSince !== null;
    this.turnEndsAt = this.clock() + (away ? AWAY_TURN_MS : TURN_MS);
    if (seat?.bot) this.botAt = this.clock() + this.thinkMs(h);
  }

  /** A bot thinks for a moment, longer while the cards are still going out; with nobody left to see, it hurries. */
  private thinkMs(h: HandState): number {
    if (this.seats.every((s) => s.bot || s.leaving)) return 0;
    const { min, max, afterDeal } = BOT_THINK_MS;
    const firstMove = h.history.every((r) => r.type.startsWith('post-'));
    return Math.round(min + this.random() * (max - min)) + (firstMove ? afterDeal : 0);
  }

  /** The bot to act moves, through the same checks as anyone else; a move the rules refuse becomes check or fold. */
  private botAct() {
    const h = this.hand!;
    const id = this.order[h.toAct];
    const style = this.seatOf(id)?.bot;
    this.botAt = null;
    if (!style) return;
    if (this.act(id, this.botPolicy(botView(h), style, this.random())) !== null) this.autoAct(id);
  }

  private finishHand() {
    const h = this.hand!;
    this.settled = this.handNo;
    this.turnEndsAt = null;
    h.players.forEach((p, i) => {
      const seat = this.seatOf(this.order[i]);
      if (seat) seat.stack = p.stack;
    });
    // the button moves one seat clockwise (on to the next occupied seat when the next hand starts)
    this.buttonSeat = (this.handSeats[h.buttonIndex] + 1) % MAX_SEATS;
    // no free rebuys: a player who lost their stack stands up and can buy in again from their bank
    for (const s of this.seats.filter((x) => x.leaving || x.stack <= 0)) this.removeSeat(s.id);
    this.settleSeats();
    this.refreshNextHand();
  }

  /** Schedule or cancel the next deal to match who is at the table. */
  private refreshNextHand() {
    if (this.inHand()) return;
    const ready = this.seats.filter((s) => !s.leaving && s.offlineSince === null);
    // bots never play a hand by themselves
    if (ready.length < 2 || ready.every((s) => s.bot)) this.nextHandAt = null;
    else if (this.nextHandAt === null && (this.hand || this.autoDeal)) this.nextHandAt = this.clock() + NEXT_HAND_MS;
  }

  private hurryIfToAct(id: string) {
    const h = this.hand;
    if (h && !h.complete && this.order[h.toAct] === id && this.turnEndsAt !== null) {
      this.turnEndsAt = Math.min(this.turnEndsAt, this.clock() + AWAY_TURN_MS);
    }
  }

  /** Stand a player up and pay out what they have in front of them (a bot's chips just go). */
  private removeSeat(id: string) {
    const k = this.seats.findIndex((s) => s.id === id);
    if (k < 0) return;
    // mid-hand (only possible once they have folded) their chips are what is left after this hand's bets
    const j = this.inHand() ? this.order.indexOf(id) : -1;
    if (!this.seats[k].bot) this.cashouts.push({ id, amount: j >= 0 ? this.hand!.players[j].stack : this.seats[k].stack });
    this.seats.splice(k, 1);
    this.refreshNextHand();
  }

  /** Stop waiting for a bot's seat; the buy-in set aside goes back. Returns false if they were not waiting. */
  private cancelReservation(id: string): boolean {
    const s = this.seats.find((x) => x.reservedBy?.id === id);
    if (!s) return false;
    this.cashouts.push({ id, amount: s.reservedBy!.buyIn });
    s.reservedBy = undefined;
    this.settleSeats();
    return true;
  }

  /**
   * Keep the bots in step with the people. Between hands: people waiting for a bot's seat take it,
   * spare bots stand up and open seats are filled up to botSeats. During a hand nobody moves, but
   * bots that will stand up afterwards are marked as leaving.
   */
  private settleSeats() {
    if (!this.inHand()) {
      this.seats = this.seats.map((s) => {
        const r = s.reservedBy;
        return r ? { id: r.id, seat: s.seat, name: r.name, stack: r.buyIn, leaving: false, offlineSince: r.offlineSince, timeouts: 0 } : s;
      });
    }
    const people = this.seats.filter((s) => !s.bot || s.reservedBy).length;
    // bots already on their way out go first
    const bots = this.seats.filter((s) => s.bot && !s.reservedBy).sort((a, b) => Number(a.leaving) - Number(b.leaving));
    const want = people ? Math.max(0, this.botSeats - people) : 0;
    const spare = bots.slice(want);
    if (this.inHand()) {
      for (const b of bots) b.leaving = spare.includes(b);
      return;
    }
    for (const b of spare) this.removeSeat(b.id);
    for (let k = bots.length; k < want && this.seats.length < MAX_SEATS; k++) this.addBot();
  }

  /**
   * Sit a bot in the open seat farthest from everyone (then farthest from the people, keeping the seats
   * beside them free for friends), playing a style nobody else at the table has.
   */
  private addBot() {
    const dist = (a: number, b: number) => Math.min(Math.abs(a - b), MAX_SEATS - Math.abs(a - b));
    const gap = (n: number, from: Seat[]) => Math.min(...from.map((s) => dist(s.seat, n)));
    const people = this.seats.filter((s) => !s.bot);
    const score = (n: number) => gap(n, this.seats) * MAX_SEATS + gap(n, people);
    const open = Array.from({ length: MAX_SEATS }, (_, n) => n).filter((n) => !this.seats.some((s) => s.seat === n));
    const seat = open.reduce((best, n) => (score(n) > score(best) ? n : best));
    const style = BOT_STYLES.find((st) => !this.seats.some((s) => s.bot === st)) ?? BOT_STYLES[this.botsMade % BOT_STYLES.length];
    this.seats.push({
      id: `${BOT_PREFIX}${++this.botsMade}`,
      seat,
      name: botStyleName(style),
      stack: BOT_BUY_IN_BB * this.stakes.bb,
      leaving: false,
      offlineSince: null,
      timeouts: 0,
      bot: style,
    });
    this.seats.sort((a, b) => a.seat - b.seat);
  }

  private firstFreeSeat(): number {
    for (let n = 0; n < MAX_SEATS; n++) if (!this.seats.some((s) => s.seat === n)) return n;
    return -1;
  }

  private seatOf(id: string): Seat | undefined {
    return this.seats.find((s) => s.id === id);
  }
}

/** When a wait for a bot's seat runs out: after RESERVE_MS, or sooner if the person has gone. */
function reservationLapses(r: Reservation): number {
  return Math.min(r.at + RESERVE_MS, r.offlineSince === null ? Infinity : r.offlineSince + RECONNECT_MS);
}
