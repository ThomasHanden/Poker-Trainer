import { Card, rankOf, suitOf } from '../../engine/cards';
import { TableConfig } from '../../engine/rules';
import { boardTexture, Texture, madeHand, drawInfo, strengthPercentile, MadeClass } from '../../engine/board';
import { HandClass, classOf, isPair, isSuited, MATRIX_RANKS, describeClass, Range, ALL_CLASSES } from '../../ranges/hands';
import { Chart, chartFreq } from '../../ranges/presets';
import { preflopRanking, equityVsRandom } from '../../ranges/preflopEquity';
import { BuildContext, Guidance, HeroSpec, DecisionContext, ActionKey, PracticeSettings } from '../types';

export const cashConfig = (n: number): TableConfig => ({ format: 'cash', numPlayers: n, sb: 50, bb: 100, ante: 0, anteType: 'none' });
export const tourneyConfig = (n: number, bbAnte = true): TableConfig => ({ format: 'tournament', numPlayers: n, sb: 50, bb: 100, ante: bbAnte ? 100 : 0, anteType: bbAnte ? 'bb' : 'none' });

export const evenStacks = (n: number, bb: number) => Array(n).fill(bb);

/** Choose from options, honoring a setting value when it is one of them. */
export function choose<T>(ctx: BuildContext, options: T[], setting: T | 'any' | undefined): T | null {
  if (setting !== undefined && setting !== 'any') return options.includes(setting as T) ? (setting as T) : null;
  return ctx.rng.pick(options);
}

export function tableSizeFor(ctx: BuildContext, supported: number[]): number | null {
  const s = ctx.settings.tableSize;
  return choose(ctx, supported, s === 'any' ? 'any' : s);
}

export function stackFor(ctx: BuildContext, options: number[]): number | null {
  const band = ctx.settings.stack;
  if (band === 'any') return ctx.rng.pick(options);
  const ranges: Record<string, [number, number]> = { short: [0, 25], medium: [26, 60], standard: [61, 120], deep: [121, 1000] };
  const [lo, hi] = ranges[band];
  const ok = options.filter((x) => x >= lo && x <= hi);
  return ok.length ? ctx.rng.pick(ok) : null;
}

export function positionFor(ctx: BuildContext, options: string[]): string | null {
  return choose(ctx, options, ctx.settings.heroPosition as string);
}

// ---------------- Preflop hand selection ----------------

const rankIndex = (h: HandClass) => preflopRanking().indexOf(h);

/** Distance (in ranking places) of a class from the edge of a frequency map's "played" region. */
function edgeDistance(freq: (h: HandClass) => number, h: HandClass): number {
  const order = preflopRanking();
  const played = order.filter((x) => freq(x) >= 0.5);
  if (played.length === 0) return 999;
  const lastPlayed = Math.max(...played.map(rankIndex));
  return Math.abs(rankIndex(h) - lastPlayed);
}

/**
 * Hero spec for chart decisions: favors a mix of clear and borderline hands depending on
 * ambiguity, and keeps roughly half of hands inside the "play" region so practice is useful.
 */
export function chartHeroSpec(ctx: BuildContext, chart: Chart, playShare = 0.55): HeroSpec {
  const play = (h: HandClass) => {
    const f = chartFreq(chart, h);
    return f.raise + f.call;
  };
  return {
    weight: (hole) => {
      const h = classOf(hole[0], hole[1]);
      const p = play(h);
      const mixed = p > 0.1 && p < 0.9;
      const dist = edgeDistance(play, h);
      const borderline = mixed || dist <= 18;
      const base = p >= 0.5 ? playShare : 1 - playShare;
      const amb = ctx.ambiguity;
      // normalize by class frequency so the in/out split is roughly playShare
      return base * (borderline ? amb : 1 - amb) * (borderline ? 3 : 1);
    },
  };
}

// ---------------- Board constraints ----------------

export const tex = (cards: Card[]): Texture => boardTexture(cards);

export const boards = {
  dryHigh: (c: Card[]) => {
    const t = tex(c);
    return t.category === 'dry-high' && t.highRank >= 10 && !t.paired;
  },
  aceOrKingHighDry: (c: Card[]) => {
    const t = tex(c);
    return !t.paired && t.rainbow && t.highRank >= 11 && t.connected === 0 && t.closePairs === 0 && t.broadwayCount <= 2;
  },
  wetLow: (c: Card[]) => {
    const t = tex(c);
    return !t.paired && !t.monotone && t.highRank <= 8 && t.connected >= 2;
  },
  wet: (c: Card[]) => {
    const t = tex(c);
    return !t.paired && !t.monotone && t.wetness >= 0.45;
  },
  medium: (c: Card[]) => {
    const t = tex(c);
    return !t.monotone && !t.trips && t.highRank >= 7;
  },
  veryDry: (c: Card[]) => {
    const t = tex(c);
    return t.rainbow && t.connected === 0 && t.closePairs <= (t.paired ? 1 : 0) && !t.monotone && (t.paired || t.highRank >= 10);
  },
  any: () => true,
  notMonotone: (c: Card[]) => !tex(c).monotone && !tex(c).trips,
  twoTone: (c: Card[]) => tex(c).twoTone && !tex(c).paired,
  highCard: (c: Card[]) => tex(c).highRank >= 10 && !tex(c).monotone,
  lowCard: (c: Card[]) => tex(c).highRank <= 9 && !tex(c).monotone && !tex(c).paired,
};

/** Turn/river card constraints given the prior board. */
export const cardsOn = {
  overcard: (c: Card[], prior: Card[]) => rankOf(c[0]) > Math.max(...prior.map(rankOf)) && !completesFlush(c[0], prior),
  brick: (c: Card[], prior: Card[]) => {
    const r = rankOf(c[0]);
    const priorRanks = prior.map(rankOf);
    const top = Math.max(...priorRanks);
    if (priorRanks.includes(r) || completesFlush(c[0], prior) || r > top) return false;
    const before = tex(prior);
    const after = tex([...prior, c[0]]);
    return after.connected <= before.connected;
  },
  flushCompleting: (c: Card[], prior: Card[]) => completesFlush(c[0], prior),
  notFlushCompleting: (c: Card[], prior: Card[]) => !completesFlush(c[0], prior),
  any: () => true,
  blank: (c: Card[], prior: Card[]) => {
    const r = rankOf(c[0]);
    return !prior.map(rankOf).includes(r) && !completesFlush(c[0], prior) && r < Math.max(...prior.map(rankOf));
  },
};

export function completesFlush(card: Card, prior: Card[]): boolean {
  const s = suitOf(card);
  return prior.filter((c) => suitOf(c) === s).length >= 2;
}

// ---------------- Postflop hero filters ----------------

export const pct = (hole: Card[], board: Card[]) => strengthPercentile(hole, board);
export const made = (hole: Card[], board: Card[]) => madeHand(hole, board).cls;
export const draws = (hole: Card[], board: Card[]) => drawInfo(hole, board);

export const STRONG_MADE: MadeClass[] = ['nuts-ish', 'monster', 'set', 'two-pair', 'trips'];
export const PAIR_CLASSES: MadeClass[] = ['overpair', 'top-pair-strong', 'top-pair-weak', 'second-pair', 'low-pair', 'underpair'];

/** A mix of hand types weighted for the difficulty: clear spots vs. ambiguous middle hands. */
export function mixWeight(ctx: BuildContext, clear: (h: Card[], b: Card[]) => boolean, borderline: (h: Card[], b: Card[]) => boolean) {
  return (h: Card[], b: Card[]) => {
    if (borderline(h, b)) return ctx.ambiguity * 2;
    if (clear(h, b)) return 1 - ctx.ambiguity;
    return 0.15;
  };
}

// ---------------- Preflop explanation of a hand's place in a range ----------------

export function explainPreflopHand(h: HandClass, f: { raise: number; call: number; fold: number }, chart?: Chart): string[] {
  const out: string[] = [];
  const eq = equityVsRandom()[h];
  const hi = MATRIX_RANKS.indexOf(h[0]);
  const lo = MATRIX_RANKS.indexOf(h[1]);
  const gap = lo - hi;
  out.push(`${describeClass(h)} has about ${(eq * 100).toFixed(0)}% all-in equity against a random hand (raw strength), and ranks #${rankIndex(h) + 1} of 169 in this app’s playability ordering.`);
  if (isPair(h)) {
    out.push(
      hi <= 3
        ? 'Big pairs are ahead of almost every range and want to build the pot.'
        : 'A pocket pair flops a set or better about 12% of the time (roughly 1 in 8.5). Small pairs depend on that, so they need stacks deep enough to get paid when they hit (implied odds), and they struggle to continue on boards with overcards.',
    );
  } else {
    if (isSuited(h)) out.push('Being suited adds roughly 2–3% raw equity and, more importantly, flush draws and backdoor draws that let you continue on more flops (better equity realization).');
    else out.push('Offsuit hands make flushes far less often and flop fewer draws, so they realize less of their equity — especially out of position.');
    if (gap === 1) out.push('Connected cards make the most straights; they can continue on many boards with draws.');
    else if (gap === 2 || gap === 3) out.push(`A ${gap - 1}-gap reduces straight possibilities compared to a connector.`);
    if (h[0] === 'A') {
      out.push(
        lo >= 9
          ? 'An ace blocks some of the opponent’s strongest hands (AA, AK, AQ), and a suited wheel ace (A5s–A2s) also makes straights — a reason these are popular 3-bet bluffs.'
          : 'Aces with weak offsuit kickers are often dominated: when you both have an ace, the bigger kicker wins, and you lose big pots with “top pair, bad kicker”.',
      );
    }
    if (hi <= 4 && lo <= 4 && !isSuited(h)) out.push('Offsuit broadway hands are good against wide ranges but are dominated by the strong hands in a tight range (e.g. KJo vs AK, KQ, AJ).');
  }
  const freqText = (x: number) => `${Math.round(x * 100)}%`;
  if (chart) {
    const parts: string[] = [];
    if (f.raise > 0) parts.push(`${chart.raiseLabel.toLowerCase()} ${freqText(f.raise)}`);
    if (f.call > 0) parts.push(`${(chart.callLabel ?? 'call').toLowerCase()} ${freqText(f.call)}`);
    if (f.fold > 0) parts.push(`fold ${freqText(f.fold)}`);
    out.push(`Chart frequencies (${chart.confidence === 'computed' ? 'computed model' : 'illustrative baseline'}): ${parts.join(', ')}.`);
  }
  return out;
}

// ---------------- Generic guidance builders ----------------

export function chartGuidance(ctx: DecisionContext, chart: Chart, extra: string[] = []): Guidance {
  const f = chartFreq(chart, ctx.heroClass);
  const rate = (x: number): Guidance['ratings'][ActionKey] => (x >= 0.75 ? 'preferred' : x >= 0.25 ? 'mixed' : x >= 0.08 ? 'discouraged' : 'mistake');
  const ratings: Guidance['ratings'] = {};
  const facingBet = ctx.toCall > 0;
  const aggressiveKey: ActionKey = ctx.la.canRaise ? 'raise' : 'bet';
  ratings[aggressiveKey] = rate(f.raise);
  if (facingBet) {
    ratings.call = rate(f.call);
    ratings.fold = rate(f.fold);
  } else {
    // unopened pot or BB option: "call" is a limp / check
    if (ctx.la.canCheck) ratings.check = rate(f.fold + f.call);
    else {
      ratings.call = rate(f.call);
      ratings.fold = rate(f.fold);
    }
  }
  // genuinely mixed hands: if two actions each have >= 25%, call both mixed (acceptable)
  const mixed = [f.raise, f.call, f.fold].filter((x) => x >= 0.25).length >= 2;
  return {
    ratings,
    reasons: [...explainPreflopHand(ctx.heroClass, f, chart), ...extra],
    mixed,
    confidence: chart.confidence === 'computed' ? 'medium' : 'medium',
    source: chart.confidence === 'computed' ? 'computed-equilibrium' : 'chart',
    plausibleRanges: chart.priorAction,
    tendencyNotes: [],
  };
}

export function rangeFromChartPlay(chart: Chart): Range {
  const r: Range = {};
  for (const h of ALL_CLASSES) r[h] = Math.min(1, (chart.raise[h] ?? 0) + (chart.call[h] ?? 0));
  return r;
}

export function settingsAllowsMultiway(s: PracticeSettings) {
  return s.players !== 'headsup';
}
