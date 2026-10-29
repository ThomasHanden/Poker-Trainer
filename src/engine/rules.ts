// No-Limit Hold'em rules and state transitions.
//
// Conventions
// - All amounts are integer chips. The UI displays them in big blinds (config.bb chips = 1bb).
// - Bet and raise amounts are expressed as "to" totals: the player's total commitment on the
//   current street after the action. "Raise by" = to - currentBet.
// - players[] is ordered by preflop action order (UTG ... BTN, SB, BB). For heads-up the order is
//   [BTN/SB, BB]. That array order is also clockwise seat order.
// - Short all-in raises (less than a full raise) do not reopen betting for players who have
//   already acted at the current bet level, unless several short all-ins together add up to a
//   full raise over the last full bet level (TDA Rule 47 style). After such a cumulative reopening
//   the minimum raise increment stays the last full valid bet/raise. See docs/RULES.md.

import { Card, deckWithout, assertUnique } from './cards';
import { evaluate } from './evaluator';

export type Format = 'cash' | 'tournament';
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type AnteType = 'none' | 'each' | 'bb';

export interface TableConfig {
  format: Format;
  numPlayers: number;
  sb: number;
  bb: number;
  ante: number; // per player for 'each'; total paid by the big blind for 'bb'
  anteType: AnteType;
}

export interface PlayerState {
  index: number;
  name: string;
  position: string;
  stack: number; // chips behind (not yet committed)
  startStack: number;
  streetCommitted: number;
  totalCommitted: number; // includes antes and blinds
  folded: boolean;
  allIn: boolean;
  hole: Card[];
  isHero: boolean;
  hasActed: boolean;
  /** state.fullRaiseCount at the time this player last acted; used for reopening rules. */
  fullRaiseSeen: number;
}

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export type RecordType = ActionType | 'post-sb' | 'post-bb' | 'post-ante';

export interface ActionRecord {
  street: Street;
  player: number;
  type: RecordType;
  /** chips added to the pot by this action */
  amount: number;
  /** streetCommitted after the action */
  to: number;
  allIn: boolean;
  potBefore: number;
  toCallBefore: number;
  /** true when a bet/raise was a full (action-reopening) raise */
  fullRaise?: boolean;
  /** scripted prior action that set up the scenario */
  scripted?: boolean;
}

export interface PotResult {
  amount: number;
  eligible: number[];
  winners: number[];
  /** winning score (undefined when won uncontested) */
  score?: number;
  shares: Record<number, number>;
}

export interface HandResult {
  reason: 'fold' | 'showdown';
  pots: PotResult[];
  payouts: Record<number, number>;
  /** net chips won/lost per player relative to their starting stacks */
  net: Record<number, number>;
  showdownPlayers: number[];
}

export interface HandState {
  config: TableConfig;
  players: PlayerState[];
  buttonIndex: number;
  street: Street;
  board: Card[];
  /** remaining cards in deal order; never visible to policies */
  deck: Card[];
  currentBet: number;
  /** minimum legal raise increment (size of last full bet/raise, at least 1bb) */
  minRaiseIncrement: number;
  fullRaiseCount: number;
  /** currentBet as of the last full bet/raise (or the big blind preflop); used for cumulative short all-ins */
  lastFullBetLevel: number;
  toAct: number; // -1 when no one is to act
  history: ActionRecord[];
  complete: boolean;
  result?: HandResult;
  /** last player to make a bet or full/short raise on the current street */
  lastAggressor: number;
  /** player who made the last preflop raise */
  preflopAggressor: number;
}

export interface LegalActions {
  player: number;
  toCall: number; // chips needed to call (capped at stack)
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  /** min/max "to" totals for a bet or raise */
  minTo: number;
  maxTo: number;
  /** true if the only legal bet/raise is all-in for less than a full raise */
  shortAllInOnly: boolean;
  currentBet: number;
  pot: number;
}

export interface PlayerAction {
  type: ActionType | 'allin';
  to?: number;
}

export const POSITIONS: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export function sbIndex(n: number): number {
  return n === 2 ? 0 : n - 2;
}
export function bbIndex(n: number): number {
  return n - 1;
}
export function buttonIndexFor(n: number): number {
  return n === 2 ? 0 : n - 3;
}

export function potSize(s: HandState): number {
  return s.players.reduce((a, p) => a + p.totalCommitted, 0);
}

/** Chips in play: stacks plus chips committed (after settlement the pot has been paid out to stacks). */
export function totalChips(s: HandState): number {
  if (s.complete) return s.players.reduce((a, p) => a + p.stack, 0);
  return s.players.reduce((a, p) => a + p.stack + p.totalCommitted, 0);
}

export interface NewHandOptions {
  config: TableConfig;
  stacks: number[]; // in players[] order
  heroIndex: number;
  holes: Card[][]; // per player, may be empty for players whose cards are sampled later
  deckOrder?: Card[]; // remaining deck order (board cards drawn from the front)
  names?: string[];
}

export function newHand(o: NewHandOptions): HandState {
  const n = o.config.numPlayers;
  if (!POSITIONS[n]) throw new Error(`Unsupported table size ${n}`);
  if (o.stacks.length !== n) throw new Error('stacks length mismatch');
  const known = o.holes.flat();
  assertUnique(known);
  const deck = o.deckOrder ?? deckWithout(known);
  assertUnique([...known, ...deck]);
  const players: PlayerState[] = o.stacks.map((st, i) => ({
    index: i,
    name: o.names?.[i] ?? (i === o.heroIndex ? 'You' : POSITIONS[n][i]),
    position: POSITIONS[n][i],
    stack: st,
    startStack: st,
    streetCommitted: 0,
    totalCommitted: 0,
    folded: false,
    allIn: false,
    hole: o.holes[i] ?? [],
    isHero: i === o.heroIndex,
    hasActed: false,
    fullRaiseSeen: 0,
  }));
  const s: HandState = {
    config: o.config,
    players,
    buttonIndex: buttonIndexFor(n),
    street: 'preflop',
    board: [],
    deck: [...deck],
    currentBet: 0,
    minRaiseIncrement: o.config.bb,
    fullRaiseCount: 0,
    lastFullBetLevel: 0,
    toAct: -1,
    history: [],
    complete: false,
    lastAggressor: -1,
    preflopAggressor: -1,
  };
  postBlinds(s);
  return s;
}

function commit(s: HandState, p: PlayerState, amount: number, street = true): number {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.totalCommitted += a;
  if (street) p.streetCommitted += a;
  if (p.stack === 0) p.allIn = true;
  void s;
  return a;
}

function postBlinds(s: HandState) {
  const { config } = s;
  const n = config.numPlayers;
  const rec = (player: number, type: RecordType, amount: number, potBefore: number) =>
    s.history.push({
      street: 'preflop',
      player,
      type,
      amount,
      to: s.players[player].streetCommitted,
      allIn: s.players[player].allIn,
      potBefore,
      toCallBefore: 0,
    });
  if (config.anteType === 'each' && config.ante > 0) {
    for (const p of s.players) {
      const pb = potSize(s);
      const a = commit(s, p, config.ante, false);
      rec(p.index, 'post-ante', a, pb);
    }
  } else if (config.anteType === 'bb' && config.ante > 0) {
    const p = s.players[bbIndex(n)];
    const pb = potSize(s);
    const a = commit(s, p, config.ante, false);
    rec(p.index, 'post-ante', a, pb);
  }
  const sb = s.players[sbIndex(n)];
  let pb = potSize(s);
  rec(sb.index, 'post-sb', commit(s, sb, config.sb), pb);
  const bb = s.players[bbIndex(n)];
  pb = potSize(s);
  rec(bb.index, 'post-bb', commit(s, bb, config.bb), pb);
  s.currentBet = Math.max(sb.streetCommitted, bb.streetCommitted);
  s.minRaiseIncrement = config.bb;
  s.lastFullBetLevel = config.bb;
  s.toAct = nextToAct(s, n === 2 ? -1 : bbIndex(n));
  if (s.toAct === -1) finishRoundIfNeeded(s);
}

/** Players who still have decisions available (not folded, not all-in). */
export function canActPlayers(s: HandState): PlayerState[] {
  return s.players.filter((p) => !p.folded && !p.allIn);
}
export function livePlayers(s: HandState): PlayerState[] {
  return s.players.filter((p) => !p.folded);
}

function needsToAct(s: HandState, p: PlayerState): boolean {
  if (p.folded || p.allIn) return false;
  if (!p.hasActed) return true;
  return p.streetCommitted < s.currentBet;
}

/** Next player (cyclic after `from`) that needs to act this round, or -1. */
function nextToAct(s: HandState, from: number, includeFirst = false): number {
  const n = s.players.length;
  const live = livePlayers(s);
  if (live.length <= 1) return -1;
  // If only one player can act and they have already matched the bet, there is nothing to do.
  for (let k = includeFirst ? 0 : 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    const p = s.players[i];
    if (needsToAct(s, p)) {
      // A lone player who can act, facing no bet they need to call, has nothing to decide
      const others = canActPlayers(s).filter((q) => q.index !== p.index);
      if (others.length === 0 && p.streetCommitted >= s.currentBet) return -1;
      return i;
    }
  }
  return -1;
}

export function legalActions(s: HandState): LegalActions | null {
  if (s.complete || s.toAct < 0) return null;
  const p = s.players[s.toAct];
  const toCallRaw = s.currentBet - p.streetCommitted;
  const toCall = Math.max(0, Math.min(toCallRaw, p.stack));
  const maxTo = p.streetCommitted + p.stack;
  const othersCanAct = s.players.some((q) => q.index !== p.index && !q.folded && !q.allIn);
  const reopened = !p.hasActed || p.fullRaiseSeen < s.fullRaiseCount;
  const facing = toCallRaw > 0;
  const la: LegalActions = {
    player: p.index,
    toCall,
    canFold: facing,
    canCheck: !facing,
    canCall: facing,
    canBet: false,
    canRaise: false,
    minTo: 0,
    maxTo,
    shortAllInOnly: false,
    currentBet: s.currentBet,
    pot: potSize(s),
  };
  if (!facing && s.currentBet === 0) {
    // opening bet
    if (p.stack > 0 && othersCanAct) {
      la.canBet = true;
      la.minTo = Math.min(s.config.bb, maxTo);
      la.shortAllInOnly = maxTo < s.config.bb;
    }
  } else if (p.stack > toCallRaw && othersCanAct && reopened) {
    // raise (also covers BB option preflop where facing = false but currentBet > 0)
    la.canRaise = true;
    const fullMin = s.currentBet + s.minRaiseIncrement;
    la.minTo = Math.min(fullMin, maxTo);
    la.shortAllInOnly = maxTo < fullMin;
  }
  return la;
}

/** Validate an action without applying it. Returns an error message or null. */
export function validateAction(s: HandState, a: PlayerAction): string | null {
  const la = legalActions(s);
  if (!la) return 'No action is pending';
  switch (a.type) {
    case 'fold':
      return la.canFold ? null : 'You cannot fold when checking is free';
    case 'check':
      return la.canCheck ? null : 'You cannot check while facing a bet';
    case 'call':
      return la.canCall ? null : 'There is nothing to call';
    case 'allin':
      return null;
    case 'bet':
    case 'raise': {
      const allowed = a.type === 'bet' ? la.canBet : la.canRaise;
      if (!allowed) return a.type === 'bet' ? 'Betting is not available (there is already a bet — raise instead)' : 'Raising is not available here';
      if (a.to === undefined || !Number.isInteger(a.to)) return 'A bet or raise needs a whole-chip "to" amount';
      if (a.to > la.maxTo) return 'That is more than your stack';
      if (a.to < la.minTo) return `The minimum is ${la.minTo} (to)`;
      if (a.to <= s.currentBet) return 'A raise must increase the bet';
      return null;
    }
  }
  return 'Unknown action';
}

export function cloneState(s: HandState): HandState {
  return structuredClone(s);
}

/** Apply an action, returning a new state. Throws on illegal actions. */
export function applyAction(prev: HandState, action: PlayerAction, scripted = false): HandState {
  const err = validateAction(prev, action);
  if (err) throw new Error(`Illegal action: ${err}`);
  const s = cloneState(prev);
  const la = legalActions(s)!;
  const p = s.players[s.toAct];
  const potBefore = potSize(s);
  const toCallBefore = la.toCall;
  let a: PlayerAction = action;
  if (a.type === 'allin') {
    if (la.canBet) a = { type: 'bet', to: la.maxTo };
    else if (la.canRaise) a = { type: 'raise', to: la.maxTo };
    else if (la.canCall) a = { type: 'call' };
    else a = { type: 'check' };
  }
  const record: ActionRecord = {
    street: s.street,
    player: p.index,
    type: a.type as ActionType,
    amount: 0,
    to: p.streetCommitted,
    allIn: false,
    potBefore,
    toCallBefore,
    scripted: scripted || undefined,
  };
  switch (a.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      break;
    case 'call':
      record.amount = commit(s, p, la.toCall);
      break;
    case 'bet':
    case 'raise': {
      const to = a.to!;
      const increment = to - s.currentBet;
      record.amount = commit(s, p, to - p.streetCommitted);
      const full = increment >= s.minRaiseIncrement;
      if (full) {
        s.minRaiseIncrement = Math.max(increment, s.config.bb);
        s.fullRaiseCount++;
        s.lastFullBetLevel = to;
        record.fullRaise = true;
      } else if (to - s.lastFullBetLevel >= s.minRaiseIncrement) {
        // cumulative short all-ins now add up to a full raise: action reopens,
        // but the minimum raise increment remains the last full raise.
        s.fullRaiseCount++;
        s.lastFullBetLevel = to;
        record.fullRaise = false;
      } else {
        record.fullRaise = false;
      }
      s.currentBet = to;
      s.lastAggressor = p.index;
      if (s.street === 'preflop') s.preflopAggressor = p.index;
      break;
    }
  }
  p.hasActed = true;
  p.fullRaiseSeen = s.fullRaiseCount;
  record.to = p.streetCommitted;
  record.allIn = p.allIn;
  s.history.push(record);
  s.toAct = nextToAct(s, p.index);
  finishRoundIfNeeded(s);
  return s;
}

function finishRoundIfNeeded(s: HandState) {
  if (s.complete) return;
  const live = livePlayers(s);
  if (live.length === 1) {
    settle(s, 'fold');
    return;
  }
  if (s.toAct !== -1) return;
  // betting round is over
  const actors = canActPlayers(s);
  if (s.street === 'river') {
    settle(s, 'showdown');
    return;
  }
  advanceStreet(s);
  if (actors.length <= 1) {
    // run out the board: no more betting possible
    while (!s.complete && (s.street as Street) !== 'river') advanceStreet(s);
    if (!s.complete) settle(s, 'showdown');
    return;
  }
  s.toAct = nextToAct(s, s.buttonIndex); // first to act postflop is the first live seat left of the button
  if (s.toAct === -1) finishRoundIfNeeded(s);
}

const NEXT: Record<Street, Street | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null };

function advanceStreet(s: HandState) {
  const next = NEXT[s.street];
  if (!next) return;
  const count = next === 'flop' ? 3 : 1;
  if (s.deck.length < count) throw new Error('Deck exhausted');
  s.board.push(...s.deck.splice(0, count));
  s.street = next;
  s.currentBet = 0;
  s.minRaiseIncrement = s.config.bb;
  s.fullRaiseCount = 0;
  s.lastFullBetLevel = 0;
  s.lastAggressor = -1;
  for (const p of s.players) {
    p.streetCommitted = 0;
    p.hasActed = false;
    p.fullRaiseSeen = 0;
  }
}

/** Order used for odd chips: first seat left of the button, clockwise. */
function seatOrderFromButton(s: HandState): number[] {
  const n = s.players.length;
  return Array.from({ length: n }, (_, k) => (s.buttonIndex + 1 + k) % n);
}

export function computePots(s: HandState): { amount: number; eligible: number[] }[] {
  const contributions = s.players.map((p) => p.totalCommitted);
  const levels = [...new Set(contributions.filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contributions) amount += Math.max(0, Math.min(c, level) - prev);
    const eligible = s.players.filter((p) => !p.folded && p.totalCommitted >= level).map((p) => p.index);
    if (amount > 0) {
      if (eligible.length === 0 && pots.length > 0) pots[pots.length - 1].amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  // merge adjacent pots with identical eligibility (cosmetic, keeps displays tidy)
  const merged: { amount: number; eligible: number[] }[] = [];
  for (const p of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.join() === p.eligible.join()) last.amount += p.amount;
    else merged.push({ ...p, eligible: [...p.eligible] });
  }
  return merged;
}

function settle(s: HandState, reason: 'fold' | 'showdown') {
  const order = seatOrderFromButton(s);
  const payouts: Record<number, number> = {};
  for (const p of s.players) payouts[p.index] = 0;
  const potsOut: PotResult[] = [];
  const pots = computePots(s);
  const live = livePlayers(s);
  const scores: Record<number, number> = {};
  if (reason === 'showdown') {
    if (s.board.length !== 5) throw new Error('Showdown requires five board cards');
    for (const p of live) {
      if (p.hole.length !== 2) throw new Error(`Player ${p.index} has no hole cards at showdown`);
      scores[p.index] = evaluate([...p.hole, ...s.board]);
    }
  }
  for (const pot of pots) {
    let winners: number[];
    let score: number | undefined;
    if (pot.eligible.length === 1 || reason === 'fold') {
      winners = pot.eligible.length ? [pot.eligible[0]] : [live[0].index];
    } else {
      score = Math.max(...pot.eligible.map((i) => scores[i]));
      winners = pot.eligible.filter((i) => scores[i] === score);
    }
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    const shares: Record<number, number> = {};
    for (const w of winners) shares[w] = share;
    for (const seat of order) {
      if (remainder === 0) break;
      if (winners.includes(seat)) {
        shares[seat]++;
        remainder--;
      }
    }
    for (const w of winners) payouts[w] += shares[w];
    potsOut.push({ amount: pot.amount, eligible: pot.eligible, winners, score, shares });
  }
  const net: Record<number, number> = {};
  for (const p of s.players) {
    p.stack += payouts[p.index];
    net[p.index] = p.stack - p.startStack;
  }
  s.complete = true;
  s.toAct = -1;
  s.result = {
    reason,
    pots: potsOut,
    payouts,
    net,
    showdownPlayers: reason === 'showdown' ? live.map((p) => p.index) : [],
  };
}

/** Amount to call for the player to act (0 if none). */
export function toCallFor(s: HandState, player: number): number {
  const p = s.players[player];
  return Math.max(0, Math.min(s.currentBet - p.streetCommitted, p.stack));
}

/** Effective stack between the hero and the live opponents: the largest opponent stack the hero can lose to, capped by hero's stack. Uses chips behind plus chips committed this hand. */
export function effectiveStack(s: HandState, player: number): number {
  const me = s.players[player];
  const mine = me.stack + me.totalCommitted;
  const opp = s.players.filter((p) => p.index !== player && !p.folded).map((p) => p.stack + p.totalCommitted);
  if (opp.length === 0) return mine;
  return Math.min(mine, Math.max(...opp));
}

/**
 * Pot-relative sizing. For a bet: to = pot * fraction.
 * For a raise "x% pot": first call, then raise by x% of the pot after calling.
 *   to = currentBet + fraction * (pot + toCall)
 * where pot includes all chips committed so far (including the bet being faced).
 * Result is clamped to [minTo, maxTo] and rounded to whole chips.
 */
export function potFractionTo(s: HandState, fraction: number): number {
  const la = legalActions(s);
  if (!la) return 0;
  const pot = potSize(s);
  const p = s.players[la.player];
  const toCall = s.currentBet - p.streetCommitted;
  let to: number;
  if (s.currentBet === 0) to = Math.round(pot * fraction);
  else to = Math.round(s.currentBet + fraction * (pot + toCall));
  return Math.max(la.minTo, Math.min(la.maxTo, to));
}

export function streetActions(s: HandState, street: Street): ActionRecord[] {
  return s.history.filter((h) => h.street === street);
}

/** Pot at the start of the given street (chips committed on earlier streets). */
export function potAtStreetStart(s: HandState, street: Street): number {
  const first = s.history.find((h) => h.street === street);
  if (first) return first.potBefore;
  return potSize(s);
}

/** Positional helper: is player a in position on player b postflop? */
export function isInPositionOver(s: HandState, a: number, b: number): boolean {
  const n = s.players.length;
  if (n === 2) return a === 0; // button acts last postflop heads-up
  // postflop order starts at SB (index n-2), then BB, then UTG ... BTN.
  const rank = (i: number) => (i - (n - 2) + n) % n;
  return rank(a) > rank(b);
}
