// Reviewing a live-table hand with the trainer.
//
// A live hand is kept as the engine's own record of it (src/ui/liveHands.ts): config, starting
// stacks, every action with its amount, the board and the result, with only the cards the player
// saw (theirs, and others' only when shown). Here each of the player's decisions is rebuilt by
// replaying that record, and then cut back to what was known at that moment: the board so far, no
// later cards, no opponents' cards. Each decision is then assessed with the trainer's own evaluator
// (generic guidance: preflop charts, pot-odds maths, and a simulation against opponent ranges
// inferred from their actions with the "unknown" opponent model). Live opponents are real people
// whose tendencies are not known, so the ranges are estimates; the result of the hand is never used.

import { applyAction, legalActions, newHand, runOut, potSize, effectiveStack, isInPositionOver, type ActionRecord, type HandState, type PlayerAction, type Street } from '../engine/rules';
import { deckWithout, hashString, type Card } from '../engine/cards';
import { evaluateDecision, SCORING_VERSION, type DecisionEvaluation, type Grade } from '../evaluation/evaluate';
import { DEFAULT_SETTINGS, type Scenario } from '../scenarios/types';
import type { ConceptId } from '../content/concepts';
import type { ProfileId } from '../opponents/profiles';

/** Bumped when the review's rules or wording change, so older saved reviews are re-made, not shown as current. */
export const LIVE_REVIEW_VERSION = 1;
/** Saved reviews are tied to this: the review version and the trainer's scoring version. */
export const ANALYSIS_VERSION = `${LIVE_REVIEW_VERSION}/${SCORING_VERSION}`;

/** What a live hand record holds (see src/ui/liveHands.ts). */
export interface ReviewableHand {
  id: string;
  room: string;
  handNo: number;
  at: number;
  me: number;
  hand: HandState;
}

/** One of the player's decisions, rebuilt from the record. */
export interface LiveDecision {
  /** index in hand.history of the player's action */
  index: number;
  /** 0, 1, 2… among the player's decisions */
  n: number;
  street: Street;
  /** the table as the player saw it, just before acting: board so far, opponents' cards hidden, nothing still to come */
  view: HandState;
  /** what the player did */
  action: PlayerAction;
  record: ActionRecord;
  /** measured from the record (not estimates) */
  facts: DecisionFacts;
}

export interface DecisionFacts {
  pot: number;
  toCall: number;
  /** share of the final pot the call is: toCall / (pot + toCall); 0 when nothing to call */
  potOdds: number;
  stack: number;
  effective: number;
  /** stack-to-pot ratio */
  spr: number;
  bb: number;
  playersIn: number;
  position: string;
  inPosition: boolean;
}

/** What could and could not be done with a hand. */
export interface Rebuilt {
  decisions: LiveDecision[];
  /** the record replays to exactly the recorded result */
  verified: boolean;
  /** why parts cannot be reviewed or assessed (empty: everything can) */
  problems: string[];
  /** the evaluator cannot assess this hand's decisions (it can still be replayed) */
  unassessable: string | null;
}

/** The order cards were dealt from the deck for the board(s), as the engine deals them (see engine/timeline.ts). */
function dealtBoard(h: HandState): Card[] {
  const b1 = h.board;
  const b2 = h.board2 ?? [];
  if (h.doubleBoard) {
    const out: Card[] = [];
    for (const [from, to] of [[0, 3], [3, 4], [4, 5]]) out.push(...b1.slice(from, to), ...b2.slice(from, to));
    return out;
  }
  if (h.runs === 2) {
    let shared = 0;
    while (shared < b1.length && b1[shared] === b2[shared]) shared++;
    return [...b1, ...b2.slice(shared)];
  }
  return b1;
}

const toAction = (r: ActionRecord): PlayerAction => (r.type === 'bet' || r.type === 'raise' ? { type: r.type, to: r.to } : { type: r.type as 'fold' | 'check' | 'call' });
const VOLUNTARY = new Set(['fold', 'check', 'call', 'bet', 'raise']);

/** A fresh hand from the record's start, with only these hole cards known and the deck in this order. */
function startFrom(h: HandState, holes: Card[][], deckOrder: Card[]): HandState {
  return newHand({
    config: h.config,
    stacks: h.players.map((p) => p.startStack),
    heroIndex: Math.max(0, h.players.findIndex((p) => p.isHero)),
    holes,
    deckOrder,
    names: h.players.map((p) => p.name),
    bomb: h.bomb,
    straddle: !!h.straddle,
    doubleBoard: h.doubleBoard,
    holdRunout: h.holdRunout,
  });
}

/** Everything else in the deck, in a fixed order (it stands for cards nobody saw). */
const unseen = (known: Card[]) => deckWithout(known);

/** Rebuild the player's decisions from the hand record, and check the record replays to its recorded result. */
export function rebuildDecisions(lh: ReviewableHand): Rebuilt {
  const h = lh.hand;
  const me = lh.me;
  const problems: string[] = [];
  if (!h || !h.complete || !h.result) return { decisions: [], verified: false, problems: ['This hand was not finished when it was saved, so it cannot be reviewed.'], unassessable: null };
  const hero = h.players[me];
  if (!hero || hero.hole.length !== 2) return { decisions: [], verified: false, problems: ['Your cards for this hand were not recorded, so it cannot be reviewed.'], unassessable: null };

  // 1. the whole hand, with every card that was shown, must replay to the recorded result
  const shownHoles = h.players.map((p) => (p.hole.length === 2 ? p.hole : []));
  const board = dealtBoard(h);
  let verified = false;
  try {
    let s = startFrom(h, shownHoles, [...board, ...unseen([...board, ...shownHoles.flat()])]);
    for (const r of h.history.slice(s.history.length)) s = applyAction(s, toAction(r));
    if (s.runoutPending) s = runOut(s, h.runs ?? 1);
    verified = s.complete && s.players.every((p, i) => p.stack === h.players[i].stack) && s.board.join() === h.board.join();
  } catch {
    verified = false;
  }
  if (!verified) problems.push('The recorded actions do not replay to the recorded result, so this hand cannot be reviewed reliably.');

  // 2. each of the player's decisions, from what they knew then
  const decisions: LiveDecision[] = [];
  if (verified) {
    // only your cards are known here, so stop at your last decision (a showdown would need everyone's)
    let s = startFrom(h, h.players.map((_, i) => (i === me ? hero.hole : [])), [...board, ...unseen([...board, ...hero.hole])]);
    const last = h.history.reduce((k, r, i) => (r.player === me && VOLUNTARY.has(r.type) ? i : k), -1);
    for (let i = s.history.length; i <= last; i++) {
      const r = h.history[i];
      if (r.player === me && VOLUNTARY.has(r.type) && s.toAct === me) {
        decisions.push({ index: i, n: decisions.length, street: r.street, view: viewAt(s, me), action: toAction(r), record: r, facts: factsAt(s, me) });
      }
      if (i < last) s = applyAction(s, toAction(r));
    }
  }
  if (verified && !decisions.length) problems.push('You had no decision to make in this hand (for example, everyone folded to your big blind, or you were all-in from the blinds).');

  // the trainer's evaluator models standard blinds, one board and ordinary preflop play
  const unassessable = h.bomb
    ? 'Bomb pots skip preflop betting, which the trainer’s ranges are not built for.'
    : h.straddle
      ? 'The straddle changes preflop ranges and positions in ways the trainer’s charts do not cover.'
      : h.doubleBoard
        ? 'With two boards, every decision depends on both, and the trainer only evaluates one.'
        : null;
  return { decisions, verified, problems, unassessable };
}

/** The table as the player saw it: their cards, the board so far, nothing else. */
function viewAt(s: HandState, me: number): HandState {
  return { ...structuredClone(s), deck: [], result: undefined, players: s.players.map((p, i) => ({ ...p, hole: i === me ? [...p.hole] : [], isHero: i === me })) };
}

function factsAt(s: HandState, me: number): DecisionFacts {
  const la = legalActions(s)!;
  const p = s.players[me];
  const pot = potSize(s);
  const live = s.players.filter((x) => !x.folded);
  const others = live.filter((x) => x.index !== me);
  return {
    pot,
    toCall: la.toCall,
    potOdds: la.toCall > 0 ? la.toCall / (pot + la.toCall) : 0,
    stack: p.stack,
    effective: effectiveStack(s, me),
    spr: p.stack / Math.max(1, pot),
    bb: s.config.bb,
    playersIn: live.length,
    position: p.position,
    inPosition: others.length > 0 && others.every((o) => isInPositionOver(s, me, o.index)),
  };
}

// ---------------- assessment ----------------

export type Assessment = 'strong' | 'reasonable' | 'improve' | 'mistake' | 'unassessed';
export const ASSESSMENT_LABEL: Record<Assessment, string> = {
  strong: 'Strong decision',
  reasonable: 'Reasonable',
  improve: 'Could improve',
  mistake: 'Likely mistake',
  unassessed: 'Not assessed',
};
export const assessmentOf = (g: Grade): Assessment =>
  g === 'best' ? 'strong' : g === 'good' ? 'reasonable' : g === 'inaccuracy' ? 'improve' : g === 'mistake' || g === 'blunder' ? 'mistake' : 'unassessed';

export interface ReviewedDecision {
  n: number;
  index: number;
  street: Street;
  assessment: Assessment;
  /** the trainer's evaluation (null when the spot cannot be assessed) */
  evaluation: DecisionEvaluation | null;
  /** why it was not assessed */
  note?: string;
}

export interface LiveReview {
  handId: string;
  version: string;
  createdAt: number;
  decisions: ReviewedDecision[];
  summary: ReviewSummary;
}

export interface ReviewSummary {
  /** the most important thing to take away */
  keyPoint: string;
  /** decisions handled well (by number) */
  good: number[];
  /** up to three improvements, each tied to a decision */
  improvements: { n: number; text: string }[];
  /** concepts to practise, most relevant first */
  concepts: ConceptId[];
  assessed: number;
}

/** The scenario the trainer's evaluator needs, for one decision of a live hand (no template: generic guidance). */
function scenarioFor(lh: ReviewableHand, d: LiveDecision): { sc: Scenario; full: HandState } {
  const h = lh.hand;
  const me = lh.me;
  const known = [...h.players[me].hole, ...d.view.board];
  // the start of the hand with only what was known at this decision: no later board cards in the deck
  const base = startFrom(
    h,
    h.players.map((p, i) => (i === me ? p.hole : [])),
    [...d.view.board, ...unseen(known)],
  );
  let full = base;
  for (let i = base.history.length; i < d.index; i++) full = applyAction(full, toAction(h.history[i]));
  const profiles: Record<number, ProfileId> = Object.fromEntries(h.players.map((_, i) => [i, 'unknown' as ProfileId]));
  const seed = hashString(`live:${lh.id}:${d.index}`);
  const sc: Scenario = {
    id: `live:${lh.id}`,
    templateId: 'live',
    templateVersion: LIVE_REVIEW_VERSION,
    seed,
    settings: DEFAULT_SETTINGS,
    difficulty: 'intermediate',
    createdAt: lh.at,
    state: full,
    base,
    heroIndex: me,
    trueProfiles: profiles,
    shownProfiles: profiles,
    params: {},
    assumptions: [],
    fingerprint: `live:${lh.id}`,
    title: 'Live hand',
    setupText: '',
  };
  return { sc, full };
}

const NO_HELP = { hint: false, potOdds: false, equity: false, feedback: false };

/** Assess one action at one decision (the one played, or one tried instead). Null when it cannot be assessed. */
export function assessAction(lh: ReviewableHand, d: LiveDecision, action: PlayerAction): DecisionEvaluation | null {
  const { sc, full } = scenarioFor(lh, d);
  return evaluateDecision(sc, { index: d.index, street: d.street, state: full, action, isKey: true, assisted: NO_HELP, elapsedMs: 0 }, { keySamples: 400, profileVariants: false });
}

/** Review every decision of a hand. Deterministic: the same hand gives the same review. */
export function reviewHand(lh: ReviewableHand, now = Date.now()): LiveReview | { error: string; problems: string[] } {
  const rb = rebuildDecisions(lh);
  if (!rb.verified) return { error: 'incomplete', problems: rb.problems };
  const decisions: ReviewedDecision[] = rb.decisions.map((d) => {
    if (rb.unassessable) return { n: d.n, index: d.index, street: d.street, assessment: 'unassessed', evaluation: null, note: rb.unassessable };
    try {
      const e = assessAction(lh, d, d.action);
      if (!e) return { n: d.n, index: d.index, street: d.street, assessment: 'unassessed', evaluation: null, note: 'The trainer could not assess this spot.' };
      return { n: d.n, index: d.index, street: d.street, assessment: assessmentOf(e.grade), evaluation: e };
    } catch (err) {
      return { n: d.n, index: d.index, street: d.street, assessment: 'unassessed', evaluation: null, note: `The trainer could not assess this spot (${(err as Error).message}).` };
    }
  });
  return { handId: lh.id, version: ANALYSIS_VERSION, createdAt: now, decisions, summary: summarise(decisions) };
}

const STREET: Record<Street, string> = { preflop: 'Preflop', flop: 'On the flop', turn: 'On the turn', river: 'On the river' };

/** Best play in words, from the evaluator's ratings ("Fold", or "Call or raise"). */
export function preferredOf(e: DecisionEvaluation): string | null {
  const pref = e.alternatives.filter((a) => a.rating === 'preferred').map((a) => a.label);
  return pref.length ? pref.join(' or ') : null;
}

export function summarise(decisions: ReviewedDecision[]): ReviewSummary {
  const assessed = decisions.filter((d) => d.evaluation && d.assessment !== 'unassessed');
  const rank: Record<Assessment, number> = { mistake: 0, improve: 1, reasonable: 2, strong: 3, unassessed: 4 };
  const weak = assessed.filter((d) => d.assessment === 'mistake' || d.assessment === 'improve').sort((a, b) => rank[a.assessment] - rank[b.assessment]);
  const improvements = weak.slice(0, 3).map((d) => {
    const e = d.evaluation!;
    const pref = preferredOf(e);
    const why = e.why.find((w) => !/^(You must call|Your equity against|Chart frequencies)/.test(w)) ?? e.why[0] ?? '';
    return { n: d.n, text: `${STREET[d.street]}, you chose ${e.actionLabel.toLowerCase()}${pref ? `; the trainer prefers ${pref.toLowerCase()}` : ''}. ${why}`.trim() };
  });
  const good = assessed.filter((d) => d.assessment === 'strong' || d.assessment === 'reasonable').map((d) => d.n);
  const concepts: ConceptId[] = [];
  for (const d of [...weak, ...assessed]) for (const c of d.evaluation!.concepts) if (!concepts.includes(c)) concepts.push(c);
  const keyPoint = !decisions.length
    ? 'You had no decision to review in this hand.'
    : !assessed.length
      ? 'The trainer could not assess the decisions in this hand, but you can still step through it and check the numbers at each point.'
      : weak.length
        ? improvements[0].text
        : `Your ${assessed.length === 1 ? 'decision was' : `${assessed.length} assessed decisions were`} in line with the trainer’s guidance. Remember the result of a hand does not decide this: good decisions lose sometimes.`;
  return { keyPoint, good, improvements, concepts: concepts.slice(0, 4), assessed: assessed.length };
}
