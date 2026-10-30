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

const choose3 = (n: number) => (n * (n - 1) * (n - 2)) / 6;

/** Number of different five-card straights that contain both ranks (matrix indices, 0 = ace). */
function straightsContaining(a: number, b: number): number {
  // rank values 14 (A) .. 2; the ace also plays low in the wheel
  const va = 14 - a;
  const vb = 14 - b;
  let n = 0;
  for (let top = 5; top <= 14; top++) {
    const inStraight = (v: number) => (v <= top && v >= top - 4) || (v === 14 && top === 5);
    if (inStraight(va) && inStraight(vb)) n++;
  }
  return n;
}

/** Hands that dominate an unpaired hand: they share one card and have a higher other card. */
function dominators(h: HandClass): string[] {
  const hi = MATRIX_RANKS.indexOf(h[0]);
  const lo = MATRIX_RANKS.indexOf(h[1]);
  const out: string[] = [];
  for (let z = 0; z < lo; z++) if (z !== hi) out.push(z < hi ? MATRIX_RANKS[z] + h[0] : h[0] + MATRIX_RANKS[z]); // keep the high card, better kicker
  for (let z = 0; z < hi; z++) out.push(MATRIX_RANKS[z] + h[1]); // keep the low card, beat the high card
  return out;
}

export function explainPreflopHand(h: HandClass, f: { raise: number; call: number; fold: number }, chart?: Chart): string[] {
  const out: string[] = [];
  const eqs = equityVsRandom();
  const eq = eqs[h];
  const hi = MATRIX_RANKS.indexOf(h[0]);
  const lo = MATRIX_RANKS.indexOf(h[1]);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  out.push(`${describeClass(h)} has about ${pct(eq)} all-in equity against a random hand (raw strength), and ranks #${rankIndex(h) + 1} of 169 in this app’s playability ordering.`);
  if (isPair(h)) {
    // exact flop odds: 50 unseen cards, 2 left of our rank, 4 of each higher rank
    const set = 1 - choose3(48) / choose3(50);
    const over = 1 - choose3(50 - 4 * hi) / choose3(50);
    if (hi === 0) out.push('Aces are the best starting hand and want to build the pot.');
    else if (hi <= 3) out.push(`Big pairs are ahead of almost every range and want to build the pot. At least one overcard still flops ${pct(over)} of the time.`);
    else if (hi <= 6)
      out.push(`Medium pairs are usually ahead preflop, but at least one overcard flops ${pct(over)} of the time, which makes them awkward after the flop. They also flop a set or better ${(set * 100).toFixed(1)}% of the time (about 1 in ${(1 / set).toFixed(1)}).`);
    else
      out.push(`A pocket pair flops a set or better ${(set * 100).toFixed(1)}% of the time (about 1 in ${(1 / set).toFixed(1)}). Small pairs depend on that, so they need deep enough stacks to get paid when they hit (implied odds), and they struggle on boards with overcards (${pct(over)} of flops have at least one).`);
  } else {
    const suited = isSuited(h);
    if (suited) {
      const gain = eqs[h] - eqs[h.slice(0, 2) + 'o'];
      out.push(`Being suited adds about ${(gain * 100).toFixed(1)} points of all-in equity over ${h.slice(0, 2)}o and, more importantly, flush draws and backdoor draws that let you continue on more flops (better equity realization).`);
    } else out.push('Offsuit hands make flushes far less often and flop fewer draws, so they realize less of their equity — especially out of position.');
    const straights = straightsContaining(hi, lo);
    if (straights >= 2) out.push(`${h[0]} and ${h[1]} fit into ${straights} different straights${straights === 4 ? ' — the most any two cards can' : ''}, so the hand flops more straight draws than a hand with a bigger gap.`);
    if (h[0] === 'A') {
      if (lo === 1) out.push('AK is the strongest unpaired hand: it dominates every other ace and king (same card, better kicker) and blocks half of the AA and KK combos.');
      else if (lo <= 4) out.push(`A strong ace: it dominates weaker aces, but ${dominators(h).filter((x) => x[0] === 'A').join(', ')} dominate${dominators(h).filter((x) => x[0] === 'A').length === 1 ? 's' : ''} it.`);
      else if (lo <= 8)
        out.push(
          suited
            ? 'Suited aces make the nut flush and play better than their offsuit versions, but the kicker is weak when you pair the ace.'
            : 'Aces with weak offsuit kickers are often dominated: when you both have an ace, the bigger kicker wins, and you lose big pots with “top pair, bad kicker”.',
        );
      else
        out.push(
          suited
            ? 'A suited wheel ace (A5s–A2s) blocks AA and AK, makes the nut flush and can make a straight (A-2-3-4-5) — a reason these are popular 3-bet bluffs.'
            : 'A small offsuit ace blocks AA and AK, but when you pair the ace your kicker is usually beaten.',
        );
    } else if (hi <= 4 && lo <= 4 && !suited) {
      const d = dominators(h);
      out.push(`Offsuit broadway hands do well against wide ranges but are dominated by the strong hands in a tight range (${h} is dominated by ${d.join(', ')}).`);
    }
  }
  const freqText = (x: number) => `${Math.round(x * 100)}%`;
  if (chart) {
    if (chart.reach && !(chart.reach[h] > 0)) {
      out.push(`${h} is not part of ${chart.reachLabel ?? 'the range that reaches this spot'}, so you never hold it here.`);
    } else {
      const parts: string[] = [];
      if (f.raise > 0) parts.push(`${chart.raiseLabel.toLowerCase()} ${freqText(f.raise)}`);
      if (f.call > 0) parts.push(`${(chart.callLabel ?? 'call').toLowerCase()} ${freqText(f.call)}`);
      if (f.fold > 0) parts.push(`fold ${freqText(f.fold)}`);
      out.push(`Chart frequencies (${chart.confidence === 'computed' ? 'computed model' : 'illustrative baseline'}): ${parts.join(', ')}.`);
    }
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
