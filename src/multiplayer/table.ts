// Live multiplayer table: seats, the button, turn timers and what each player is allowed to see.
// Runs on the Cloudflare table server (party/server.ts). It has no Cloudflare dependencies so it
// can be unit tested; the server only passes messages in and sends views out.

import { fullDeck, rankOf, type Card } from '../engine/cards';
import { applyAction, buttonIndexFor, forfeit, legalActions, newHand, runOut, validateAction, type HandState, type PlayerAction } from '../engine/rules';
import type { ProfileId } from '../opponents/profiles';
import { BOT_BUY_IN_BB, BOT_PREFIX, BOT_STYLES, BOT_THINK_MS, botName, botView, practicePolicy, type BotPolicy } from './bots';
import type { BankStatus } from './bank';
import type { ChatClientMessage, ChatServerMessage } from './chat';

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
/**
 * Time bank: extra time a player can draw on once their turn runs out. Everyone starts with
 * TIME_BANK_START, gains TIME_BANK_PER_HAND for each hand dealt to them, and holds at most TIME_BANK_MAX.
 */
export const TIME_BANK_START = 30_000;
export const TIME_BANK_PER_HAND = 5_000;
export const TIME_BANK_MAX = 60_000;
/** Longest anyone waits for the host to let them sit before the request lapses. */
export const REQUEST_MS = 10 * 60_000;
/** How long players have to agree to run it twice; anyone who has not answered by then is a no. */
export const RUNOUT_MS = 10_000;

/** What the host of a private table chooses (public tables use the defaults). */
export interface TableSettings {
  /** seconds for each turn */
  turnSecs: number;
  /** the host lets each new player sit */
  approval: boolean;
  /** after a hand, anyone can see the cards that would have come */
  rabbitHunt: boolean;
  /** 7-2 bounty: whoever wins a hand with 7-2 and shows it collects this many big blinds from each other player dealt in; 0 is off */
  bounty72: number;
  /** a bomb pot every this many hands (0: only when the host calls one) */
  bombEvery: number;
  /** what each player puts in a bomb pot, in big blinds */
  bombBB: number;
  /** players can choose to straddle (two big blinds, live) when they are under the gun */
  straddle: boolean;
  /** when everyone is all-in, the players can agree to run the rest of the board twice */
  runItTwice: boolean;
  /** two boards, each playing for half of every pot: 0 never, 1 in bomb pots, 2 every hand */
  doubleBoard: number;
}
export const TURN_SECS = [15, 20, 30, 45, 60];
export const BOUNTY_BB = [0, 1, 2, 5];
export const BOMB_EVERY = [0, 5, 10, 20];
export const BOMB_BB = [1, 2, 3, 5];
export const DOUBLE_BOARD = [0, 1, 2];
export const DEFAULT_SETTINGS: TableSettings = {
  turnSecs: TURN_MS / 1000,
  approval: false,
  rabbitHunt: true,
  bounty72: 0,
  bombEvery: 0,
  bombBB: 2,
  straddle: false,
  runItTwice: false,
  doubleBoard: 0,
};

/** Settings from a browser: anything not on the menus falls back to the default. */
export function cleanSettings(raw: unknown): TableSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, from: number[], dflt: number) => (typeof v === 'number' && from.includes(v) ? v : dflt);
  return {
    turnSecs: pick(r.turnSecs, TURN_SECS, DEFAULT_SETTINGS.turnSecs),
    approval: r.approval === true,
    rabbitHunt: r.rabbitHunt !== false,
    bounty72: pick(r.bounty72, BOUNTY_BB, 0),
    bombEvery: pick(r.bombEvery, BOMB_EVERY, 0),
    bombBB: pick(r.bombBB, BOMB_BB, DEFAULT_SETTINGS.bombBB),
    straddle: r.straddle === true,
    runItTwice: r.runItTwice === true,
    doubleBoard: pick(r.doubleBoard, DOUBLE_BOARD, 0),
  };
}

/** The quick reactions players can send from their seat. */
export const REACTIONS = ['👍', '😂', '😮', '😬', '🔥', '👏', '🙏', '😭'];

/** A hand of 7 and 2 (any suits). */
export const isSevenDeuce = (hole: Card[]) => hole.length === 2 && [rankOf(hole[0]), rankOf(hole[1])].sort((a, b) => a - b).join() === '0,5';

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

/** The most of a balance that can be brought to a table: whole chips, up to its maximum buy-in (below its minimum means you cannot sit). */
export const bestBuyIn = (st: Stakes, balance: number) => Math.floor(Math.min(buyInFor(st).max, balance) / CHIP) * CHIP;

/**
 * Public tables you could join now with this balance: the minimum buy-in is covered and a person
 * could sit (an open seat, or a bot's). Tables whose state is not known are left out rather than
 * offered on a guess.
 */
export function affordableTables(balance: number, summaries: Record<string, TableSummary | null | undefined>, except?: string): string[] {
  return PUBLIC_TABLES.filter((room) => {
    const s = summaries[room];
    return room !== except && buyInFor(stakesFor(room)).min <= balance && !!s && s.players < s.maxSeats;
  });
}

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
  | { type: 'action'; action: PlayerAction }
  /** after a hand: show your cards to the table */
  | { type: 'show' }
  /** after a hand that ended early: see the board cards that would have come */
  | { type: 'rabbit' }
  /** the creator of a private table becomes its host and sets it up; the host can change the settings later */
  | { type: 'host'; settings: Partial<TableSettings> }
  /** host only */
  | { type: 'pause'; paused: boolean }
  | { type: 'bomb'; on: boolean }
  | { type: 'remove'; target: string }
  | { type: 'approve'; target: string; ok: boolean }
  /** a quick reaction, shown by the player's seat */
  | { type: 'react'; emoji: string }
  /** straddle whenever you are under the gun (tables that allow it) */
  | { type: 'straddle'; on: boolean }
  /** everyone is all-in: your answer to running it twice */
  | { type: 'runout'; twice: boolean }
  /** a signed-in connection's first message: its access token */
  | { type: 'auth'; token: string }
  | ChatClientMessage;

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
  /** played by the server (named "Bot 3" and so on); how a bot plays is never sent */
  bot: boolean;
  /** a bot whose seat someone is waiting to take when this hand ends */
  reserved: boolean;
  /** seconds of time bank left */
  timeBank: number;
  /** straddles when under the gun */
  straddle: boolean;
}

/** One person's chips at this table since it opened: what they brought, took away and have now. */
export interface LedgerLine {
  id: string;
  name: string;
  /** total bought in */
  buyIn: number;
  /** total taken back to the bank */
  cashOut: number;
  /** at the table now (a stack, or a buy-in set aside for a bot's seat) */
  stack: number;
  /** cashOut + stack - buyIn */
  net: number;
}

/** Someone asking the host for a seat. */
export interface SeatRequest {
  id: string;
  name: string;
  seat: number;
  buyIn: number;
  at: number;
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
  /** how long the current turn was (the turn time, or the time bank once that is in use) */
  turnMs: number;
  /** the player to act is using their time bank */
  timeBankOn: boolean;
  nextHandAt: number | null;
  /** server clock when this view was made, for countdowns */
  now: number;
  settings: TableSettings;
  /** the host's player id (private tables whose creator set them up), else null */
  host: string | null;
  /** the host has stopped new hands from being dealt */
  paused: boolean;
  /** the next hand is a bomb pot */
  bombNext: boolean;
  /** what everyone has brought and taken since the table opened */
  ledger: LedgerLine[];
  /** the host sees who is asking to sit; everyone else sees only their own request */
  requests: SeatRequest[];
  /** after a hand that ended early, the board cards that would have come (when someone asked) */
  rabbit: Card[];
  /** hand.players indexes who showed their cards after the hand */
  shownBy: number[];
  /** this hand's own id (random), so a saved hand is never confused with another */
  handId: string;
  /** the last hand's 7-2 bounty: who won it (hand.players index) and the total collected */
  bounty: { player: number; total: number } | null;
  /** how many people are watching without a seat (filled in by the server) */
  watching?: number;
  /** everyone is all-in and the players are choosing to run it once or twice: each player's answer so far (by hand.players index), and the deadline */
  runout: { deadline: number; votes: Record<number, boolean | null> } | null;
}

export type ServerMessage =
  | TableView
  | { type: 'error'; message: string }
  /** the viewer's chips away from the table and their daily claim */
  | ({ type: 'bank' } & BankStatus)
  /** a signed-in connection whose token could not be confirmed (the server then closes it) */
  | { type: 'auth-error'; message: string }
  /** someone at the table reacted */
  | { type: 'reaction'; from: string; emoji: string; at: number }
  | ChatServerMessage;

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
  /** time bank left, ms */
  timeBank: number;
  /** a person who straddles when under the gun */
  straddle?: boolean;
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

/** A player's table name. Names starting with the word "bot" belong to bots, so nobody can pass for one (or pass a bot off as a person). */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
  return s && !/^bot\b/i.test(s) ? s : 'Player';
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
  /** a private table: its creator can host it (settings, pause, approvals) */
  hostable?: boolean;
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
  readonly hostable: boolean;
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
  settings: TableSettings = { ...DEFAULT_SETTINGS };
  hostId: string | null = null;
  paused = false;
  bombNext = false;
  private ledger = new Map<string, { name: string; buyIn: number; cashOut: number }>();
  private requests: SeatRequest[] = [];
  /** let in by the host: they never need asking again */
  private approved = new Set<string>();
  /** taken off the table by the host: they cannot sit here again */
  private removed = new Set<string>();
  /** hand.players indexes whose cards were shown after the hand */
  private shown = new Set<number>();
  private rabbitCards: Card[] = [];
  private bountyWon: { player: number; total: number } | null = null;
  /** the seat now drawing on its time bank, and when that started */
  private banking: { id: string; from: number; had: number } | null = null;
  private turnLength = TURN_MS;
  /** the current (or last) hand's id */
  private handId = '';
  /** run it twice: who has answered (hand.players index → yes/no), until the deadline */
  private runoutVote: { deadline: number; votes: Map<number, boolean> } | null = null;

  constructor(opts: LiveTableOptions = {}) {
    this.stakes = opts.stakes ?? LOW_STAKES;
    this.autoDeal = opts.autoDeal ?? true;
    this.clock = opts.clock ?? Date.now;
    this.shuffleDeck = opts.shuffleDeck ?? shuffle;
    this.botSeats = Math.max(0, Math.min(MAX_SEATS, Math.floor(opts.botSeats ?? 0)));
    this.botPolicy = opts.botPolicy ?? practicePolicy;
    this.random = opts.random ?? cryptoRandom;
    this.hostable = opts.hostable ?? false;
  }

  inHand(): boolean {
    return !!this.hand && !this.hand.complete;
  }

  isSeated(id: string): boolean {
    return !!this.seatOf(id);
  }

  /**
   * The name to sit under: refused if someone else at the table (seated or waiting for a seat)
   * already has it, except the default "Player", which gets a number instead.
   */
  private freeName(id: string, name: string): string | null {
    const taken = new Set(
      this.seats.flatMap((s) => [s.id !== id ? s.name : null, s.reservedBy && s.reservedBy.id !== id ? s.reservedBy.name : null]).filter((n): n is string => !!n).map((n) => n.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    if (name.toLowerCase() !== 'player') return null;
    for (let n = 2; ; n++) if (!taken.has(`player ${n}`)) return `Player ${n}`;
  }

  /** A seated person's table name (for chat), or undefined. */
  personName(id: string): string | undefined {
    const s = this.seatOf(id);
    return s && !s.bot ? s.name : undefined;
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
      case 'show':
        return this.show(id);
      case 'rabbit':
        return this.rabbitHunt(id);
      case 'host':
        return this.setHost(id, m.settings);
      case 'pause':
        if (id !== this.hostId) return 'Only the host can pause the game';
        this.paused = m.paused === true;
        this.refreshNextHand();
        return null;
      case 'bomb':
        if (id !== this.hostId) return 'Only the host can call a bomb pot';
        this.bombNext = m.on === true;
        return null;
      case 'remove':
        return this.removePlayer(id, m.target);
      case 'straddle': {
        const seat = this.seatOf(id);
        if (!seat || seat.bot) return 'Sit down first';
        if (!this.settings.straddle) return 'This table does not allow straddles';
        seat.straddle = m.on === true;
        return null;
      }
      case 'runout':
        return this.voteRunout(id, m.twice === true);
      default:
        return 'Unknown message';
    }
  }

  setOnline(id: string, on: boolean) {
    if (id === this.hostId) {
      this.hostOnline = on;
      // nobody can let people in or restart the game while the host is gone
      if (!on && this.paused) {
        this.paused = false;
        this.refreshNextHand();
      }
    }
    if (!on) this.requests = this.requests.filter((q) => q.id !== id);
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
  sit(id: string, wanted: string, buyIn = 0, seatNo?: number): string | null {
    const name = this.freeName(id, wanted);
    if (name === null) return `Someone at this table is already called ${wanted}. Choose another name.`;
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
      if (this.removed.has(id)) return 'The host has taken you off this table.';
      const chosen = seatNo ?? this.firstFreeSeat();
      const problem = this.seatProblem(chosen);
      if (problem) return problem;
      if (buyIn <= 0) return 'You need chips to sit down';
      const bot = this.seats.find((s) => s.seat === chosen);
      if (bot) {
        bot.reservedBy = { id, name, buyIn, at: this.clock(), offlineSince: null };
      } else {
        this.seats.push({ id, seat: chosen, name, stack: buyIn, leaving: false, offlineSince: null, timeouts: 0, timeBank: TIME_BANK_START });
        this.seats.sort((a, b) => a.seat - b.seat); // clockwise by seat number
      }
      const line = this.ledger.get(id) ?? { name, buyIn: 0, cashOut: 0 };
      this.ledger.set(id, { ...line, name, buyIn: line.buyIn + buyIn });
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
    if (this.paused) return 'The host has paused the game';
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
    // a bomb pot when the host called one or it is its turn, and everyone can cover it
    const bombAmount = this.settings.bombBB * this.stakes.bb;
    const bombDue = this.bombNext || (this.settings.bombEvery > 0 && (this.handNo + 1) % this.settings.bombEvery === 0);
    const bomb = bombDue && ordered.every((s) => s.stack > bombAmount);
    if (bomb) this.bombNext = false;
    // the straddle is under the gun's (players[0]), when they asked for it and the table allows it
    const straddle = !bomb && n >= 3 && this.settings.straddle && !!ordered[0].straddle && !ordered[0].bot;
    const doubleBoard = this.settings.doubleBoard === 2 || (this.settings.doubleBoard === 1 && bomb);
    this.hand = newHand({
      config: { format: 'cash', numPlayers: n, sb: this.stakes.sb, bb: this.stakes.bb, ante: 0, anteType: 'none' },
      stacks: ordered.map((s) => s.stack),
      heroIndex: -1,
      holes,
      deckOrder: deck,
      names: ordered.map((s) => s.name),
      bomb: bomb ? bombAmount : undefined,
      straddle,
      doubleBoard,
      holdRunout: this.settings.runItTwice && !doubleBoard,
    });
    this.handId = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.shown = new Set();
    this.rabbitCards = [];
    this.bountyWon = null;
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
    const waits = [...this.seats.flatMap((s) => (s.reservedBy ? [reservationLapses(s.reservedBy)] : [])), ...this.requests.map((q) => q.at + REQUEST_MS)];
    const times = this.inHand()
      ? [this.turnEndsAt, this.botAt, this.runoutVote?.deadline ?? null, ...waits]
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
    const asked = this.requests.length;
    this.requests = this.requests.filter((q) => now < q.at + REQUEST_MS);
    if (this.requests.length !== asked) lapsed = true;
    const h = this.hand;
    if (h && !h.complete && this.runoutVote && now >= this.runoutVote.deadline) {
      this.runItOut(1); // not everyone said yes in time
      return true;
    }
    if (h && !h.complete) {
      // the move is tied to this exact turn: anything that changes the hand reschedules or clears it
      if (this.botAt !== null && now >= this.botAt) {
        this.botAct();
        return true;
      }
      if (this.turnEndsAt === null || now < this.turnEndsAt) return lapsed;
      const id = this.order[h.toAct];
      const seat = this.seatOf(id);
      // out of time: a player who is still here draws on their time bank first
      if (seat && !seat.bot && !seat.leaving && seat.offlineSince === null && seat.timeBank > 0 && !this.banking) {
        this.banking = { id, from: now, had: seat.timeBank };
        this.turnLength = seat.timeBank;
        this.turnEndsAt = now + seat.timeBank;
        return true;
      }
      if (seat && this.banking?.id === id) {
        seat.timeBank = 0;
        this.banking = null;
      }
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
    const shown = new Set([...(h?.complete && h.result?.reason === 'showdown' ? h.result.showdownPlayers : []), ...(h?.complete ? this.shown : [])]);
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
        bot: !!s.bot,
        reserved: !!s.reservedBy,
        timeBank: Math.round((this.banking?.id === s.id ? Math.max(0, this.banking.had - (this.clock() - this.banking.from)) : s.timeBank) / 1000),
        straddle: !!s.straddle,
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
      turnMs: this.turnLength,
      timeBankOn: this.inHand() && !!this.banking,
      nextHandAt: this.nextHandAt,
      now: this.clock(),
      settings: this.settings,
      host: this.hostId,
      paused: this.paused,
      bombNext: this.bombNext,
      ledger: this.ledgerLines(),
      requests: id === this.hostId ? this.requests : this.requests.filter((q) => q.id === id),
      rabbit: this.rabbitCards,
      shownBy: h?.complete ? [...this.shown] : [],
      handId: this.handId,
      bounty: this.bountyWon,
      runout: this.runoutVote && h && !h.complete
        ? { deadline: this.runoutVote.deadline, votes: Object.fromEntries(h.players.map((p, i) => [i, p.folded ? undefined : (this.runoutVote!.votes.get(i) ?? null)]).filter(([, v]) => v !== undefined)) }
        : null,
    };
  }

  // ---------------- run it twice ----------------

  /** Everyone is all-in: start the vote. Bots always agree; players who are away or leaving say no. */
  private startRunoutVote() {
    const h = this.hand!;
    const votes = new Map<number, boolean>();
    h.players.forEach((p, i) => {
      if (p.folded) return;
      const seat = this.seatOf(this.order[i]);
      if (seat?.bot) votes.set(i, true);
      else if (!seat || seat.leaving || seat.offlineSince !== null) votes.set(i, false);
    });
    this.runoutVote = { deadline: this.clock() + RUNOUT_MS, votes };
    this.settleRunoutVote();
  }

  private voteRunout(id: string, twice: boolean): string | null {
    const h = this.hand;
    const k = this.order.indexOf(id);
    if (!h?.runoutPending || !this.runoutVote || k < 0 || h.players[k].folded) return 'There is nothing to decide';
    if (!this.runoutVote.votes.has(k)) this.runoutVote.votes.set(k, twice);
    this.settleRunoutVote();
    return null;
  }

  /** One no runs it once; everyone saying yes runs it twice; otherwise keep waiting. */
  private settleRunoutVote() {
    const h = this.hand!;
    const v = this.runoutVote!;
    const players = h.players.map((p, i) => (p.folded ? -1 : i)).filter((i) => i >= 0);
    if (players.some((i) => v.votes.get(i) === false)) this.runItOut(1);
    else if (players.every((i) => v.votes.get(i) === true)) this.runItOut(2);
  }

  private runItOut(times: 1 | 2) {
    this.runoutVote = null;
    this.hand = runOut(this.hand!, times);
    this.afterChange();
  }

  // ---------------- private tables: the host ----------------

  private hostOnline = false;

  /** The creator of a private table becomes its host; after that only the host changes the settings. */
  private setHost(id: string, raw: unknown): string | null {
    if (!this.hostable) return 'Public tables have no host';
    if (this.hostId !== null && this.hostId !== id) return 'Only the host can change the table';
    if (this.hostId === null) {
      this.hostId = id;
      this.hostOnline = true;
    }
    this.settings = cleanSettings(raw);
    this.refreshNextHand();
    return null;
  }

  /** A player needs the host's go-ahead to sit (the host is here to give it, and has not already). */
  needsApproval(id: string): boolean {
    return this.settings.approval && this.hostId !== null && this.hostOnline && id !== this.hostId && !this.approved.has(id) && !this.isSeated(id) && !this.reservationOf(id);
  }

  /** Ask the host for a seat; nothing is taken from the bank until they say yes. */
  requestSeat(id: string, name: string, seat: number, buyIn: number): string | null {
    if (this.removed.has(id)) return 'The host has taken you off this table.';
    const problem = this.seatProblem(seat);
    if (problem) return problem;
    this.requests = [...this.requests.filter((q) => q.id !== id), { id, name, seat, buyIn, at: this.clock() }];
    return null;
  }

  /** The host's answer to a request: the request, so the server can buy them in (yes), or null. */
  answerRequest(host: string, target: unknown, ok: boolean): SeatRequest | { error: string } | null {
    if (host !== this.hostId) return { error: 'Only the host can let players in' };
    const q = this.requests.find((x) => x.id === target);
    if (!q) return { error: 'That request has gone' };
    this.requests = this.requests.filter((x) => x !== q);
    if (!ok) return null;
    this.approved.add(q.id);
    return q;
  }

  /** The host takes someone off the table: they stand up (after the hand they are playing) and cannot sit again. */
  private removePlayer(host: string, target: unknown): string | null {
    if (host !== this.hostId) return 'Only the host can remove players';
    if (typeof target !== 'string' || target === host) return 'Pick someone else';
    if (this.seatOf(target)?.bot) return 'Bots stand up by themselves';
    this.removed.add(target);
    this.approved.delete(target);
    this.requests = this.requests.filter((q) => q.id !== target);
    this.leave(target);
    return null;
  }

  private ledgerLines(): LedgerLine[] {
    return [...this.ledger].map(([id, l]) => {
      const seat = this.seatOf(id);
      const stack = seat && !seat.bot ? seat.stack : (this.reservationOf(id)?.buyIn ?? 0);
      return { id, name: seat?.name ?? l.name, buyIn: l.buyIn, cashOut: l.cashOut, stack, net: l.cashOut + stack - l.buyIn };
    });
  }

  // ---------------- after a hand ----------------

  /** Show your cards to the table once the hand is over. */
  private show(id: string): string | null {
    const h = this.hand;
    const k = this.order.indexOf(id);
    if (!h?.complete || k < 0) return 'You can show your cards once the hand is over';
    this.shown.add(k);
    this.collectBounty();
    return null;
  }

  /** The board cards that would have come, for a hand that ended before the river. */
  private rabbitHunt(id: string): string | null {
    const h = this.hand;
    if (!this.settings.rabbitHunt) return 'Rabbit hunting is off at this table';
    if (!h?.complete || h.board.length >= 5) return 'There is nothing to hunt';
    if (!this.isSeated(id) && !this.order.includes(id)) return 'Sit down to rabbit hunt';
    if (!this.rabbitCards.length) this.rabbitCards = h.deck.slice(0, 5 - h.board.length);
    return null;
  }

  /**
   * 7-2 bounty: a player who wins the hand (all of it, not a split) holding 7-2, and whose cards
   * were seen (at showdown, or shown afterwards), collects the bounty from each other player dealt
   * in who is still at the table, up to what they have.
   */
  private collectBounty() {
    const h = this.hand;
    const bb = this.settings.bounty72;
    if (!h?.complete || !h.result || !bb || this.bountyWon) return;
    const r = h.result;
    const contested = r.pots.filter((p) => p.eligible.length > 1);
    const w = r.reason === 'fold' ? r.pots[0]?.winners[0] : contested.length && contested[0].winners.length === 1 ? contested[0].winners[0] : undefined;
    if (w === undefined || !isSevenDeuce(h.players[w].hole)) return;
    const seen = r.reason === 'showdown' ? r.showdownPlayers.includes(w) : this.shown.has(w);
    if (!seen) return;
    const winner = this.seatOf(this.order[w]);
    if (!winner && this.order[w].startsWith(BOT_PREFIX)) return; // a bot that has gone: nobody to pay
    let total = 0;
    this.order.forEach((pid, i) => {
      const seat = this.seatOf(pid);
      if (i === w || !seat || seat.stack <= 0) return;
      const pay = Math.min(bb * this.stakes.bb, seat.stack);
      seat.stack -= pay;
      total += pay;
    });
    if (winner) winner.stack += total;
    else this.payOut(this.order[w], total); // the winner had already stood up
    this.bountyWon = { player: w, total };
    // anyone the bounty cleaned out stands up, as after any hand
    for (const s of this.seats.filter((x) => x.stack <= 0)) this.removeSeat(s.id);
    this.settleSeats();
    this.refreshNextHand();
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
    // whoever was on their time bank keeps what they did not use
    if (this.banking) {
      const seat = this.seatOf(this.banking.id);
      if (seat) seat.timeBank = Math.max(0, this.banking.had - (this.clock() - this.banking.from));
      this.banking = null;
    }
    if (!h.runoutPending) this.runoutVote = null;
    if (h.complete) {
      if (this.settled !== this.handNo) this.finishHand();
      return;
    }
    if (h.runoutPending) {
      // nobody acts until the players decide how to run out the board
      this.turnEndsAt = null;
      if (!this.runoutVote) this.startRunoutVote();
      return;
    }
    const seat = this.seatOf(this.order[h.toAct]);
    const away = !seat || (seat.leaving && !seat.bot) || seat.offlineSince !== null;
    this.turnLength = away ? AWAY_TURN_MS : this.settings.turnSecs * 1000;
    this.turnEndsAt = this.clock() + this.turnLength;
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
      if (seat) {
        seat.stack = p.stack;
        if (!seat.bot) seat.timeBank = Math.min(TIME_BANK_MAX, seat.timeBank + TIME_BANK_PER_HAND);
      }
    });
    // the button moves one seat clockwise (on to the next occupied seat when the next hand starts)
    this.buttonSeat = (this.handSeats[h.buttonIndex] + 1) % MAX_SEATS;
    // no free rebuys: a player who lost their stack stands up and can buy in again from their bank
    for (const s of this.seats.filter((x) => x.leaving || x.stack <= 0)) this.removeSeat(s.id);
    this.settleSeats();
    this.refreshNextHand();
    this.collectBounty();
  }

  /** Schedule or cancel the next deal to match who is at the table. */
  private refreshNextHand() {
    if (this.inHand()) return;
    if (this.paused) {
      this.nextHandAt = null;
      return;
    }
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
    if (!this.seats[k].bot) this.payOut(id, j >= 0 ? this.hand!.players[j].stack : this.seats[k].stack);
    this.seats.splice(k, 1);
    this.refreshNextHand();
  }

  /** Chips going back to a person's bank, noted in the table's ledger. */
  private payOut(id: string, amount: number) {
    this.cashouts.push({ id, amount });
    const line = this.ledger.get(id);
    if (line) line.cashOut += amount;
  }

  /** Stop waiting for a bot's seat; the buy-in set aside goes back. Returns false if they were not waiting. */
  private cancelReservation(id: string): boolean {
    const s = this.seats.find((x) => x.reservedBy?.id === id);
    if (!s) return false;
    this.payOut(id, s.reservedBy!.buyIn);
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
        return r ? { id: r.id, seat: s.seat, name: r.name, stack: r.buyIn, leaving: false, offlineSince: r.offlineSince, timeouts: 0, timeBank: TIME_BANK_START } : s;
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
      name: botName(seat),
      stack: BOT_BUY_IN_BB * this.stakes.bb,
      leaving: false,
      offlineSince: null,
      timeouts: 0,
      timeBank: 0,
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
