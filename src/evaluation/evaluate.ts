// Decision evaluation and scoring.
//
// Scores are INSTRUCTIONAL ASSESSMENTS, not exact measures of optimal play. Each decision is
// rated by (a) the template's strategic guidance (heuristic/chart/equilibrium/exact math) and
// (b) where feasible, a simulation of EV against the modeled opponent. Results are labeled with
// their sources and confidence. Outcomes (who won the pot) are never used.

import { HandState, PlayerAction, legalActions, potFractionTo, ActionRecord, Street } from '../engine/rules';
import { cardsToString } from '../engine/cards';
import { describeHolding } from '../engine/board';
import { buildDecisionContext, rolloutEVs, betResponse, RolloutResult } from './analysis';
import { facingBetGuidance, bettingGuidance, equityMath, rangeText, positionText, textureText, sprText, pctStr, bbStr, betSizeFraction } from './guides';
import { policyDistribution, publicView } from '../opponents/policy';
import { PROFILES, ProfileId } from '../opponents/profiles';
import { getTemplate } from '../scenarios/templates';
import { ActionKey, DecisionContext, Guidance, Scenario } from '../scenarios/types';
import { ConceptId } from '../content/concepts';

export const SCORING_VERSION = '1.0.0';

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'unscored';
export const GRADE_POINTS: Record<Exclude<Grade, 'unscored'>, number> = { best: 100, good: 85, inaccuracy: 60, mistake: 25, blunder: 0 };
export const GRADE_LABEL: Record<Grade, string> = {
  best: 'Preferred play',
  good: 'Reasonable play',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Serious mistake',
  unscored: 'Not scored (insufficient confidence)',
};

export interface Assistance {
  hint: boolean;
  potOdds: boolean;
  equity: boolean;
  feedback: boolean;
}

export interface DecisionRecord {
  index: number; // position in hand history where hero acted
  street: Street;
  state: HandState; // full state before the hero's action
  action: PlayerAction; // as resolved (bet/raise with to, or fold/check/call)
  isKey: boolean;
  assisted: Assistance;
  elapsedMs: number;
}

export interface AltEval {
  key: ActionKey;
  label: string;
  rating?: Guidance['ratings'][ActionKey];
  evBB?: number;
  seBB?: number;
}

export interface DecisionEvaluation {
  decisionIndex: number;
  street: Street;
  isKey: boolean;
  actionKey: ActionKey;
  actionLabel: string;
  grade: Grade;
  points: number | null;
  sizing?: { verdict: 'preferred' | 'acceptable' | 'off'; note: string; chosen: string };
  confidence: 'high' | 'medium' | 'low' | 'none';
  sources: string[];
  info: string;
  ranges: string;
  context: string[];
  intent: string;
  alternatives: AltEval[];
  why: string[];
  tendencies: string[];
  math: NonNullable<Guidance['math']>;
  modelSummary?: string;
  conflict?: string;
  recommended: string;
  concepts: ConceptId[];
  mistakeCategories: string[];
  assisted: boolean;
  profileVariants?: { profile: string; best: string }[];
}

export interface ScenarioEvaluation {
  scenarioId: string;
  scoringVersion: string;
  templateVersion: number;
  decisions: DecisionEvaluation[];
  score: number | null; // weighted average of scored decisions
  confidence: 'high' | 'medium' | 'low' | 'none';
  takeaway: string;
  correct: string[];
  mistakes: string[];
  lessons: string[];
  assisted: boolean;
}

export function actionKeyOf(a: PlayerAction, s: HandState): ActionKey {
  if (a.type === 'allin') {
    const la = legalActions(s)!;
    return la.canBet ? 'bet' : la.canRaise ? 'raise' : 'call';
  }
  return a.type;
}

export function actionLabel(a: PlayerAction, s: HandState): string {
  const bb = s.config.bb;
  const la = legalActions(s)!;
  const k = actionKeyOf(a, s);
  const to = a.type === 'allin' ? la.maxTo : a.to;
  if (k === 'bet' || k === 'raise') {
    const allIn = to === la.maxTo;
    const pot = la.pot;
    const frac = k === 'bet' ? (to! - s.players[la.player].streetCommitted) / pot : (to! - s.currentBet) / (pot + (s.currentBet - s.players[la.player].streetCommitted));
    const verb = k === 'bet' ? 'Bet' : 'Raise to';
    return `${verb} ${bbStr(to!, bb)}${allIn ? ' (all-in)' : s.street === 'preflop' ? '' : ` (${Math.round(frac * 100)}% pot)`}`;
  }
  if (k === 'call') return `Call ${bbStr(la.toCall, bb)}${la.toCall >= s.players[la.player].stack ? ' (all-in)' : ''}`;
  return k === 'fold' ? 'Fold' : 'Check';
}

// ---------------- generic guidance for non-template decisions ----------------

function genericGuidance(ctx: DecisionContext): Guidance {
  if (ctx.street === 'preflop') {
    if (ctx.facing === 'allin') return { ...facingBetGuidance(ctx, { allowImplied: false }), source: 'exact-math', confidence: 'medium' };
    // baseline chart behavior for this situation = the policy's "unknown" profile with the hero's cards
    const view = publicView(ctx.state, ctx.hero);
    view.state.players[ctx.hero].hole = ctx.hole;
    const opts = policyDistribution(view, PROFILES.unknown);
    const by: Partial<Record<ActionKey, number>> = {};
    for (const o of opts) by[o.kind] = (by[o.kind] ?? 0) + o.prob;
    const rate = (p: number | undefined): Guidance['ratings'][ActionKey] => (p === undefined || p < 0.05 ? 'mistake' : p >= 0.6 ? 'preferred' : p >= 0.2 ? 'mixed' : 'discouraged');
    const ratings: Guidance['ratings'] = {};
    if (ctx.la.canFold) ratings.fold = rate(by.fold);
    if (ctx.la.canCheck) ratings.check = rate(by.check);
    if (ctx.la.canCall) ratings.call = rate(by.call);
    if (ctx.la.canRaise) ratings.raise = rate(by.raise);
    const parts = Object.entries(by).map(([k, v]) => `${k} ${pctStr(v ?? 0)}`);
    return {
      ratings,
      reasons: [`The baseline preflop charts for this situation play ${ctx.heroClass} as: ${parts.join(', ')}.`, positionText(ctx)],
      confidence: 'medium',
      source: 'chart',
      plausibleRanges: rangeText(ctx),
      math: equityMath(ctx),
      sizing: !ctx.la.canRaise
        ? undefined
        : ctx.state.currentBet <= ctx.bb
          ? { preferred: ctx.state.players[ctx.hero].position === 'SB' ? [2.5, 3.5] : [2, 3], acceptable: [1.8, 4.5], note: 'Standard opens are 2–3bb (about 3bb from the small blind), plus about 1bb for each limper.', unit: 'bb-to' }
          : ctx.inPosition
            ? { preferred: [2.5, 3.5], acceptable: [2.2, 4.5], note: 'In position, re-raises are usually about 3x the previous raise.', unit: 'x-raise' }
            : { preferred: [3.5, 4.5], acceptable: [3, 5.5], note: 'Out of position, re-raises are usually about 4x the previous raise.', unit: 'x-raise' },
    };
  }
  if (ctx.toCall > 0) return facingBetGuidance(ctx);
  return bettingGuidance(ctx, { bluffOk: ctx.inPosition });
}

// ---------------- concrete recommended size ----------------

const STD_FRACTIONS = [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25, 1.5, 2];

/** Turn the guidance's preferred sizing band into an exact amount, e.g. "Raise to 2.5bb" or "Bet 4.5bb (66% pot)". */
function recommendedSize(ctx: DecisionContext, k: 'bet' | 'raise', g: Guidance, rollouts: RolloutResult[]): string | undefined {
  const la = ctx.la;
  const bb = ctx.bb;
  let to: number | undefined;
  let note = '';
  if (g.sizing) {
    const [lo, hi] = g.sizing.preferred;
    const mid = (lo + hi) / 2;
    const unit = g.sizing.unit ?? 'pot';
    if (unit === 'pot') {
      const inBand = STD_FRACTIONS.filter((f) => f >= lo - 1e-9 && f <= hi + 1e-9);
      const f = inBand.length ? inBand.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)) : Math.round(mid * 100) / 100;
      to = potFractionTo(ctx.state, f);
      note = `${Math.round(f * 100)}% pot`;
    } else if (unit === 'bb-to') {
      to = Math.round(mid * 2) * (bb / 2);
    } else {
      const m = Math.round(mid * 2) / 2;
      to = Math.round(m * ctx.state.currentBet);
      note = `${m}x`;
    }
  } else {
    const rs = rollouts.filter((r) => r.action.type === k && r.label !== 'Your action' && r.action.to !== undefined);
    const top = rs.length ? rs.reduce((a, b) => (b.ev > a.ev ? b : a)) : undefined;
    if (top) {
      to = top.action.to!;
      const m = /(\d+)%/.exec(top.label);
      if (m) note = `${m[1]}% pot`;
    }
  }
  // preflop re-raises with short stacks (or facing big raises) are shoves
  if (to === undefined && ctx.street === 'preflop' && (ctx.effectiveBB <= 25 || ctx.state.currentBet >= 0.2 * la.maxTo)) to = la.maxTo;
  if (to === undefined) return undefined;
  // readable amounts: nearest quarter big blind
  to = Math.round(to / (bb / 4)) * (bb / 4);
  to = Math.max(la.minTo, Math.min(la.maxTo, to));
  if (to >= la.maxTo) return `All-in (${bbStr(la.maxTo, bb)})`;
  if (note.endsWith('% pot')) note = `${Math.round(betSizeFraction(ctx, to) * 100)}% pot`;
  return `${k === 'bet' ? 'Bet' : 'Raise to'} ${bbStr(to, bb)}${note ? ` (${note})` : ''}`;
}

// ---------------- candidates for model EV ----------------

function candidates(ctx: DecisionContext, chosen: PlayerAction): { action: PlayerAction; label: string }[] {
  const la = ctx.la;
  const out: { action: PlayerAction; label: string }[] = [];
  const add = (a: PlayerAction, label: string) => {
    const key = `${a.type}:${a.to ?? ''}`;
    if (!out.some((o) => `${o.action.type}:${o.action.to ?? ''}` === key)) out.push({ action: a, label });
  };
  if (la.canFold) add({ type: 'fold' }, 'Fold');
  if (la.canCheck) add({ type: 'check' }, 'Check');
  if (la.canCall) add({ type: 'call' }, 'Call');
  if (la.canBet) {
    for (const f of [0.33, 0.66, 1.0]) {
      const to = potFractionTo(ctx.state, f);
      if (to < la.maxTo) add({ type: 'bet', to }, `Bet ${Math.round(f * 100)}%`);
    }
    if (ctx.spr <= 3 || (chosen.type === 'bet' && chosen.to === la.maxTo)) add({ type: 'bet', to: la.maxTo }, 'All-in');
  }
  if (la.canRaise) {
    const to = potFractionTo(ctx.state, 0.75);
    if (to < la.maxTo) add({ type: 'raise', to }, 'Raise 75%');
    add({ type: 'raise', to: la.maxTo }, 'All-in');
  }
  const c = chosen.type === 'allin' ? { type: la.canBet ? 'bet' : la.canRaise ? 'raise' : 'call', to: la.canBet || la.canRaise ? la.maxTo : undefined } as PlayerAction : chosen;
  add(c, 'Your action');
  return out;
}

function pairedSE(a: RolloutResult, b: RolloutResult): number {
  let n = 0, sum = 0, sumSq = 0;
  for (let i = 0; i < a.values.length; i++) {
    const x = a.values[i], y = b.values[i];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    const d = x - y;
    n++;
    sum += d;
    sumSq += d * d;
  }
  if (n < 2) return Infinity;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean) / n);
}

// ---------------- main ----------------

export interface EvalOptions {
  samples?: number;
  keySamples?: number;
  profileVariants?: boolean;
}

export function evaluateDecision(sc: Scenario, rec: DecisionRecord, opts: EvalOptions = {}): DecisionEvaluation {
  const template = getTemplate(sc.templateId);
  const ctx = buildDecisionContext(sc, rec.state, rec.isKey);
  let g: Guidance;
  try {
    g = rec.isKey && template && !template.genericGuide ? template.guide(ctx) : genericGuidance(ctx);
  } catch (e) {
    g = { ratings: {}, reasons: [`Guidance unavailable: ${(e as Error).message}`], confidence: 'low', source: 'heuristic' };
  }
  const key = actionKeyOf(rec.action, rec.state);
  const label = actionLabel(rec.action, rec.state);
  const bb = ctx.bb;

  // model EV for postflop decisions
  let rollouts: RolloutResult[] = [];
  if (ctx.street !== 'preflop' && ctx.villains.length > 0) {
    const n = rec.isKey ? opts.keySamples ?? 500 : opts.samples ?? 250;
    rollouts = rolloutEVs(ctx, candidates(ctx, rec.action), n, sc.seed + rec.index * 31);
  }
  const chosenTo = rec.action.type === 'allin' ? ctx.la.maxTo : rec.action.to;
  const chosenRoll = rollouts.find((r) => r.action.type === key && (key === 'bet' || key === 'raise' ? r.action.to === chosenTo : true) && r.label === 'Your action') ??
    rollouts.find((r) => r.action.type === key && (key === 'bet' || key === 'raise' ? r.action.to === chosenTo : true));
  const best = rollouts.length ? rollouts.reduce((a, b) => (b.ev > a.ev ? b : a)) : undefined;
  let modelVerdict: 'close' | 'small' | 'clear' | 'large' | undefined;
  let modelConfident = false;
  let lossFrac = 0;
  if (best && chosenRoll && Number.isFinite(chosenRoll.ev)) {
    const loss = best.ev - chosenRoll.ev;
    const se = best === chosenRoll ? 0 : pairedSE(best, chosenRoll);
    lossFrac = loss / ctx.pot;
    modelConfident = se / ctx.pot < 0.06;
    const tol = Math.max(0.03, (2 * se) / ctx.pot);
    modelVerdict = lossFrac <= tol ? 'close' : lossFrac <= 0.1 ? 'small' : lossFrac <= 0.25 ? 'clear' : 'large';
  }

  const rating = g.ratings[key];
  let grade: Grade;
  let conflict: string | undefined;
  switch (rating) {
    case 'preferred':
      grade = 'best';
      if (modelConfident && modelVerdict === 'large') conflict = `Against this simulated ${PROFILES[ctx.villains[0]?.profile ?? 'unknown'].short} opponent, the simulation found ${best!.label.toLowerCase()} clearly better. The baseline recommendation still stands as the default; the gap is an exploitative adjustment.`;
      break;
    case 'acceptable':
    case 'mixed':
      grade = 'good';
      if (modelConfident && (modelVerdict === 'clear' || modelVerdict === 'large')) conflict = `Reasonable in general, but against this simulated opponent ${best!.label.toLowerCase()} performed better in the simulation.`;
      break;
    case 'discouraged':
      grade = 'inaccuracy';
      if (modelConfident && (modelVerdict === 'clear' || modelVerdict === 'large') && lossFrac > 0.15) grade = 'mistake';
      if (modelConfident && modelVerdict === 'close' && best === chosenRoll) {
        grade = 'good';
        conflict = 'The baseline guidance discourages this, but against this simulated opponent it performed as well as the alternatives — a legitimate exploitative choice.';
      }
      break;
    case 'mistake':
      grade = 'mistake';
      if (modelConfident && modelVerdict === 'large' && lossFrac > 0.35) grade = 'blunder';
      if (modelConfident && modelVerdict === 'close') {
        grade = 'inaccuracy';
        conflict = 'The baseline guidance rates this as a mistake, but the simulation against this opponent found the difference small.';
      }
      break;
    default:
      if (!modelVerdict || !modelConfident) grade = 'unscored';
      else grade = modelVerdict === 'close' ? (best === chosenRoll ? 'best' : 'good') : modelVerdict === 'small' ? 'inaccuracy' : modelVerdict === 'clear' ? 'mistake' : 'blunder';
  }

  // sizing
  let sizing: DecisionEvaluation['sizing'];
  let sizingAdj = 0;
  if ((key === 'bet' || key === 'raise') && g.sizing && chosenTo !== undefined) {
    const unit = g.sizing.unit ?? 'pot';
    const v = unit === 'pot' ? betSizeFraction(ctx, chosenTo) : unit === 'bb-to' ? chosenTo / bb : chosenTo / Math.max(1, ctx.state.currentBet);
    const inR = (r: [number, number]) => v >= r[0] - 1e-9 && v <= r[1] + 1e-9;
    const verdict = inR(g.sizing.preferred) ? 'preferred' : inR(g.sizing.acceptable) ? 'acceptable' : 'off';
    const fmt = unit === 'pot' ? `${Math.round(v * 100)}% pot` : unit === 'bb-to' ? `${v.toFixed(1)}bb` : `${v.toFixed(1)}x`;
    const band = (r: [number, number]) => (unit === 'pot' ? `${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}% pot` : unit === 'bb-to' ? `${r[0]}–${r[1]}bb` : `${r[0]}–${r[1]}x`);
    sizing = { verdict, chosen: fmt, note: `${g.sizing.note} Preferred: ${band(g.sizing.preferred)}; acceptable: ${band(g.sizing.acceptable)}.` };
    if (grade === 'best' || grade === 'good') sizingAdj = verdict === 'preferred' ? 0 : verdict === 'acceptable' ? -5 : -20;
    if (verdict === 'off' && grade === 'best') grade = 'good';
  }
  const points = grade === 'unscored' ? null : Math.max(0, GRADE_POINTS[grade] + sizingAdj);

  // sources & confidence
  const sources: string[] = [];
  const srcName: Record<Guidance['source'], string> = {
    chart: 'Baseline chart (illustrative)',
    'computed-equilibrium': 'Computed push/fold equilibrium (chip EV)',
    'exact-math': 'Exact calculation under stated assumptions',
    icm: 'ICM calculation (Malmuth–Harville) under stated assumptions',
    heuristic: 'Heuristic strategy guidance',
  };
  if (rating) sources.push(srcName[g.source]);
  if (ctx.equity && Number.isFinite(ctx.equity.equity)) sources.push(`Equity: ${ctx.equity.source}`);
  if (rollouts.length) sources.push(`Simulation vs opponent model (${rollouts[0].n} samples per action)`);
  const confidence: DecisionEvaluation['confidence'] = grade === 'unscored' ? 'none' : rating && modelVerdict && modelConfident ? (g.confidence === 'low' ? 'medium' : g.confidence) : g.confidence;

  // explanations
  const me = ctx.state.players[ctx.hero];
  const villainsTxt = ctx.villains.map((v) => `${v.position} (${PROFILES[v.profile].short})`).join(' and ');
  const info = [
    `${ctx.street[0].toUpperCase() + ctx.street.slice(1)}. You hold ${cardsToString(ctx.hole)}${ctx.board.length ? ` on ${cardsToString(ctx.board)} — ${describeHolding(ctx.hole, ctx.board)}` : ''}.`,
    `Pot ${bbStr(ctx.pot, bb)}${ctx.toCall ? `, ${bbStr(ctx.toCall, bb)} to call` : ''}; your stack ${bbStr(me.stack, bb)}; effective stack ${ctx.effectiveBB.toFixed(1)}bb; SPR ${ctx.spr.toFixed(1)}.`,
    `Opponent${ctx.villains.length > 1 ? 's' : ''}: ${villainsTxt || 'none'}; you are ${ctx.inPosition ? 'in position' : 'out of position'}.`,
    `Action so far: ${historyText(rec.state, sc.heroIndex)}.`,
  ].join(' ');
  const context = [positionText(ctx), ctx.board.length ? textureText(ctx) : '', ctx.board.length ? sprText(ctx) : `Effective stacks are ${ctx.effectiveBB.toFixed(0)}bb.`].filter(Boolean);
  const intent = describeIntent(ctx, rec.action, key);
  const altKeys: ActionKey[] = (['fold', 'check', 'call', 'bet', 'raise'] as ActionKey[]).filter((k) =>
    k === 'fold' ? ctx.la.canFold : k === 'check' ? ctx.la.canCheck : k === 'call' ? ctx.la.canCall : k === 'bet' ? ctx.la.canBet : ctx.la.canRaise,
  );
  const alternatives: AltEval[] = altKeys.map((k) => {
    const rs = rollouts.filter((r) => r.action.type === k && r.label !== 'Your action');
    const top = rs.length ? rs.reduce((a, b) => (b.ev > a.ev ? b : a)) : undefined;
    const sized = k === 'bet' || k === 'raise' ? recommendedSize(ctx, k, g, rollouts) : undefined;
    const plain = k === 'call' ? `Call ${bbStr(ctx.toCall, bb)}` : k[0].toUpperCase() + k.slice(1);
    return { key: k, label: sized ?? (k === 'bet' || k === 'raise' ? top?.label ?? plain : plain), rating: g.ratings[k], evBB: top ? top.ev / bb : undefined, seBB: top ? top.se / bb : undefined };
  });
  const preferredKeys = (Object.keys(g.ratings) as ActionKey[]).filter((k) => g.ratings[k] === 'preferred');
  const mixedKeys = (Object.keys(g.ratings) as ActionKey[]).filter((k) => g.ratings[k] === 'mixed' || g.ratings[k] === 'acceptable');
  const recParts: string[] = [];
  if (preferredKeys.length) recParts.push(`Preferred: ${preferredKeys.join(' / ')}`);
  if (mixedKeys.length) recParts.push(`also reasonable: ${mixedKeys.join(' / ')}`);
  if (g.sizing && (preferredKeys.includes('bet') || preferredKeys.includes('raise') || mixedKeys.includes('bet') || mixedKeys.includes('raise'))) recParts.push(`sizing: ${g.sizing.note}`);
  if (best && modelConfident) recParts.push(`best in simulation vs this opponent model: ${best.label.toLowerCase()}`);
  const modelSummary = rollouts.length
    ? `Simulated EV vs the modeled opponent (relative to your stack at this decision; hand played out by the opponent model and a baseline policy for your later decisions): ` +
      rollouts
        .slice()
        .sort((a, b) => b.ev - a.ev)
        .map((r) => `${r.label === 'Your action' ? label : r.label}: ${r.ev >= 0 ? '+' : ''}${(r.ev / bb).toFixed(2)}bb ±${((1.96 * r.se) / bb).toFixed(2)}`)
        .join('; ') +
      '. These are estimates for this model, not true EVs.'
    : undefined;

  // concepts & categories
  const concepts: ConceptId[] = rec.isKey && template && !template.genericGuide ? template.concepts : genericConcepts(ctx, key);
  const mistakeCategories: string[] = [];
  if (grade === 'inaccuracy' || grade === 'mistake' || grade === 'blunder') mistakeCategories.push(...concepts);
  if (sizing?.verdict === 'off') mistakeCategories.push('bet-sizing');

  // profile variants (key postflop decisions only)
  let profileVariants: DecisionEvaluation['profileVariants'];
  if (rec.isKey && opts.profileVariants !== false && ctx.street !== 'preflop' && ctx.villains.length === 1) {
    profileVariants = [];
    for (const pid of ['station', 'nit', 'lag'] as ProfileId[]) {
      if (pid === ctx.villains[0].profile) continue;
      try {
        const alt = buildDecisionContext(sc, rec.state, true, { profilesOverride: { ...sc.shownProfiles, [ctx.villains[0].index]: pid }, equitySamples: 2000 });
        const rr = rolloutEVs(alt, candidates(alt, rec.action).filter((c) => c.label !== 'Your action'), 150, sc.seed + 977);
        const b = rr.length ? rr.reduce((a, x) => (x.ev > a.ev ? x : a)) : undefined;
        if (b) profileVariants.push({ profile: PROFILES[pid].name, best: `${b.label} (${(b.ev / bb).toFixed(2)}bb in simulation)` });
      } catch {
        /* ignore */
      }
    }
  }

  return {
    decisionIndex: rec.index,
    street: ctx.street,
    isKey: rec.isKey,
    actionKey: key,
    actionLabel: label,
    grade,
    points,
    sizing,
    confidence,
    sources,
    info,
    ranges: g.plausibleRanges ?? rangeText(ctx),
    context,
    intent,
    alternatives,
    why: g.reasons,
    tendencies: g.tendencyNotes ?? [],
    math: g.math ?? equityMath(ctx) ?? [],
    modelSummary,
    conflict,
    recommended: recParts.join('; ') || 'No single recommendation with enough confidence.',
    concepts,
    mistakeCategories,
    assisted: rec.assisted.hint || rec.assisted.equity || rec.assisted.potOdds || rec.assisted.feedback,
    profileVariants,
  };
}

function genericConcepts(ctx: DecisionContext, key: ActionKey): ConceptId[] {
  if (ctx.street === 'preflop') return ctx.facing === 'allin' ? ['push-fold', 'pot-odds'] : ctx.toCall > ctx.bb ? ['facing-open', 'three-bet'] : ['preflop-open'];
  if (ctx.toCall > 0) return ctx.facing === 'raise' ? ['facing-raise', 'pot-odds'] : ['pot-odds', ...(ctx.street === 'river' ? (['bluff-catch'] as ConceptId[]) : [])];
  const eq = ctx.equity?.equity ?? 0.5;
  if (key === 'bet') return eq >= 0.55 ? ['value-bet', 'bet-sizing'] : ctx.draws && ctx.draws.drawEquity > 0.2 ? ['semi-bluff'] : ['bluff'];
  return eq >= 0.55 ? ['value-bet'] : ['equity-realization'];
}

function describeIntent(ctx: DecisionContext, a: PlayerAction, key: ActionKey): string {
  const eq = ctx.equity?.equity ?? NaN;
  const draw = ctx.draws && ctx.street !== 'river' ? ctx.draws.drawEquity : 0;
  switch (key) {
    case 'fold':
      return `Folding forfeits the ${bbStr(ctx.pot, ctx.bb)} pot to avoid putting in more. It is right when your equity — plus what you can win later — does not justify the price${Number.isFinite(eq) ? ` (your equity vs the modeled range: ${pctStr(eq)}; needed: ${pctStr(ctx.requiredEquity)})` : ''}.`;
    case 'check':
      return Number.isFinite(eq) && eq >= 0.6
        ? 'Checking a strong hand aims to keep weaker hands and bluffs in, protect your checking range, or control the pot — at the cost of value now and of giving free cards.'
        : 'Checking keeps the pot small and realizes your equity for free; with a weak hand it gives up on winning the pot immediately.';
    case 'call':
      return draw >= 0.15
        ? 'Calling with a draw aims to realize your draw equity (and implied odds) without risking a raise war.'
        : ctx.street === 'river'
          ? 'Calling on the river is a bluff-catch: you win only if the bettor is bluffing (or value-betting worse).'
          : 'Calling keeps your opponent’s bluffs and weaker bets in while you realize your equity.';
    case 'bet':
    case 'raise': {
      const to = a.type === 'allin' ? ctx.la.maxTo : a.to!;
      const r = ctx.villains.length === 1 ? betResponse(ctx, { type: key, to }) : null;
      const kind = Number.isFinite(eq) && eq >= 0.55 ? 'value' : draw >= 0.2 ? 'a semi-bluff' : 'a bluff (or protection)';
      const mech = r
        ? ` Under the model, this size makes ${pctStr(r.fold)} of their range fold (${pctStr(r.betterFolds)} of the range is better than you and folds) and ${pctStr(r.call + r.raise)} continue (${pctStr(r.worseCalls)} of the range is worse and continues).`
        : '';
      return `This ${key} works as ${kind}: value bets want worse hands to call; bluffs and semi-bluffs want better hands to fold and deny equity.${mech}`;
    }
  }
}

function historyText(s: HandState, hero: number): string {
  const name = (i: number) => (i === hero ? 'you' : s.players[i].position);
  const parts: string[] = [];
  let street: string | null = null;
  for (const h of s.history as ActionRecord[]) {
    if (h.type === 'post-ante' || h.type === 'post-sb' || h.type === 'post-bb') continue;
    if (h.type === 'fold' && h.street === 'preflop' && !s.players[h.player].isHero) continue;
    if (h.street !== street) {
      street = h.street;
      parts.push(`[${h.street}]`);
    }
    const amt = h.type === 'bet' || h.type === 'raise' ? ` ${bbStr(h.to, s.config.bb)}` : h.type === 'call' ? ` ${bbStr(h.amount, s.config.bb)}` : '';
    parts.push(`${name(h.player)} ${h.type}${amt}${h.allIn ? ' (all-in)' : ''}`);
  }
  return parts.length ? parts.join(', ') : 'no voluntary action yet';
}

export function evaluateScenario(sc: Scenario, decisions: DecisionRecord[], opts: EvalOptions = {}): ScenarioEvaluation {
  const template = getTemplate(sc.templateId);
  const evals = decisions.map((d) => evaluateDecision(sc, d, opts));
  const scored = evals.filter((e) => e.points !== null);
  let score: number | null = null;
  if (scored.length) {
    const w = (e: DecisionEvaluation) => (e.isKey ? 2 : 1) * (e.confidence === 'low' ? 0.6 : 1);
    const tw = scored.reduce((a, e) => a + w(e), 0);
    score = Math.round(scored.reduce((a, e) => a + w(e) * (e.points as number), 0) / tw);
  }
  const confs = scored.map((e) => e.confidence);
  const confidence: ScenarioEvaluation['confidence'] = !scored.length ? 'none' : confs.includes('low') ? 'low' : confs.every((c) => c === 'high') ? 'high' : 'medium';
  const correct = evals.filter((e) => e.grade === 'best' || e.grade === 'good').map((e) => `${cap(e.street)}: ${e.actionLabel} — ${GRADE_LABEL[e.grade].toLowerCase()}${e.sizing && e.sizing.verdict !== 'off' ? `, sizing ${e.sizing.verdict}` : ''}.`);
  const worst = evals
    .filter((e) => e.grade === 'inaccuracy' || e.grade === 'mistake' || e.grade === 'blunder' || e.sizing?.verdict === 'off')
    .sort((a, b) => (a.points ?? 100) - (b.points ?? 100));
  const mistakes = worst.map((e) => `${cap(e.street)}: ${e.actionLabel} — ${e.grade === 'good' || e.grade === 'best' ? 'sizing outside the recommended range' : GRADE_LABEL[e.grade].toLowerCase()}. ${e.recommended}.`);
  const keyEval = evals.find((e) => e.isKey);
  const takeaway = template
    ? worst.length
      ? `${template.objectives[0]} ${worst[0].why[0] ?? ''}`
      : `${template.objectives[0]} You handled the key decision well${keyEval?.grade === 'unscored' ? ' (though it could not be scored confidently)' : ''}.`
    : '';
  return {
    scenarioId: sc.id,
    scoringVersion: SCORING_VERSION,
    templateVersion: sc.templateVersion,
    decisions: evals,
    score,
    confidence,
    takeaway,
    correct,
    mistakes,
    lessons: template?.lessons ?? [],
    assisted: evals.some((e) => e.assisted),
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------------- help shown during guided practice ----------------

export interface LiveHelp {
  requiredEquity: number;
  pot: number;
  toCall: number;
  equity?: { value: number; method: string; samples: number; se: number };
  rangeSummary?: string;
}

export function liveHelp(sc: Scenario, state: HandState, withEquity: boolean): LiveHelp {
  const ctx = buildDecisionContext(sc, state, false, { equitySamples: withEquity ? 6000 : 1 });
  return {
    requiredEquity: ctx.requiredEquity,
    pot: ctx.pot,
    toCall: ctx.toCall,
    equity: withEquity && ctx.equity && Number.isFinite(ctx.equity.equity) ? { value: ctx.equity.equity, method: ctx.equity.source, samples: ctx.equity.samples, se: ctx.equity.stdError } : undefined,
    rangeSummary: withEquity ? rangeText(ctx) : undefined,
  };
}
