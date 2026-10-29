// Daily puzzles: short multiple-choice questions whose answers are computed from the app's own
// charts, hand evaluator and formulas. The same date gives the same five puzzles to everyone.

import { Card, Rng, createRng, hashString, fullDeck, cardToString } from '../engine/cards';
import { compareHands, describeScore, evaluate, categoryOf, HandCategory } from '../engine/evaluator';
import { getChart, chartFreq, chartPlayRange } from '../ranges/presets';
import { ALL_CLASSES, HandClass, combosOf, describeClass, rangePercent } from '../ranges/hands';
import { preflopRanking } from '../ranges/preflopEquity';

export interface Puzzle {
  id: string;
  kind: 'open' | 'potodds' | 'showdown' | 'combos' | 'bluff' | 'shove';
  topic: string;
  prompt: string;
  hero?: Card[];
  villain?: Card[];
  board?: Card[];
  options: string[];
  answer: number;
  explain: string;
  lesson: string;
}

const lower = (t: string) => t[0].toLowerCase() + t.slice(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const bbs = (x: number) => `${+x.toFixed(1)}bb`;

function shuffleOptions(rng: Rng, correct: string, wrong: string[]): { options: string[]; answer: number } {
  const w = [...new Set(wrong)].filter((x) => x !== correct).slice(0, 3);
  const options = rng.shuffle([correct, ...w]);
  return { options, answer: options.indexOf(correct) };
}

/** Three distinct wrong percentages: common mistakes first, then nearby values. */
function percentDistractors(correct: number, mistakes: number[]): string[] {
  const c = pct(correct);
  const out: string[] = [];
  for (const m of [...mistakes, correct + 0.08, correct - 0.07, correct + 0.15, correct - 0.12, correct + 0.22]) {
    const v = pct(Math.min(0.95, Math.max(0.03, m)));
    if (v !== c && !out.includes(v)) out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

/** A concrete two-card holding for a hand class. */
function holdingFor(rng: Rng, h: HandClass): Card[] {
  const combos = combosOf(h);
  const c = combos[Math.floor(rng.next() * combos.length)];
  return [c[0], c[1]];
}

/** Hands near the edge of a chart that the chart plays either always or never. */
function clearEdgeHand(rng: Rng, freq: (h: HandClass) => number): HandClass {
  const order = preflopRanking();
  const n = order.filter((h) => freq(h) > 0).length;
  const near = order.slice(Math.max(0, n - 35), n + 35).filter((h) => freq(h) === 0 || freq(h) === 1);
  const pool = near.length ? near : ALL_CLASSES.filter((h) => freq(h) === 0 || freq(h) === 1);
  return pool[Math.floor(rng.next() * pool.length)];
}

function openPuzzle(rng: Rng, id: string): Puzzle {
  const pos = rng.pick(['UTG', 'HJ', 'CO', 'BTN']);
  const chart = getChart(`cash6-open-${pos}`)!;
  const h = clearEdgeHand(rng, (x) => chartFreq(chart, x).raise);
  const opens = chartFreq(chart, h).raise === 1;
  const share = rangePercent(chartPlayRange(chart)).toFixed(0);
  return {
    id,
    kind: 'open',
    topic: 'Preflop',
    prompt: `6-max cash, 100bb. Everyone folds to you in the ${pos}. Open-raise or fold?`,
    hero: holdingFor(rng, h),
    options: ['Raise', 'Fold'],
    answer: opens ? 0 : 1,
    explain: `The baseline ${pos} chart ${opens ? 'opens' : 'folds'} ${describeClass(h)} (${h}). From the ${pos} it opens about ${share}% of hands${pos === 'UTG' ? ', the tightest seat because five players still act behind you' : pos === 'BTN' ? ', the widest seat because only the blinds are left' : ''}.`,
    lesson: 'opening-ranges',
  };
}

function potOddsPuzzle(rng: Rng, id: string): Puzzle {
  const pot = rng.pick([6, 8, 10, 12, 15, 20, 24, 30, 40]);
  const [label, f] = rng.pick([
    ['a third of the pot', 1 / 3],
    ['half the pot', 1 / 2],
    ['two-thirds of the pot', 2 / 3],
    ['three-quarters of the pot', 3 / 4],
    ['the size of the pot', 1],
    ['twice the pot', 2],
  ] as [string, number][]);
  const bet = Math.round(pot * f * 2) / 2;
  const need = bet / (pot + 2 * bet);
  const correct = pct(need);
  // typical mistakes: bet ÷ (pot + bet) and bet ÷ pot
  const { options, answer } = shuffleOptions(rng, correct, percentDistractors(need, [bet / (pot + bet), bet / pot]));
  return {
    id,
    kind: 'potodds',
    topic: 'Pot odds',
    prompt: `River. The pot is ${bbs(pot)} and your opponent bets ${bbs(bet)} (${label}). What equity do you need to call?`,
    options,
    answer,
    explain: `You call ${bbs(bet)} to win a final pot of ${bbs(pot)} + ${bbs(bet)} + ${bbs(bet)} = ${bbs(pot + 2 * bet)}. Required equity = ${bbs(bet)} ÷ ${bbs(pot + 2 * bet)} ≈ ${correct}.`,
    lesson: 'pot-odds',
  };
}

function showdownPuzzle(rng: Rng, id: string): Puzzle {
  for (let t = 0; t < 50; t++) {
    const deck = rng.shuffle(fullDeck());
    const hero = deck.slice(0, 2);
    const villain = deck.slice(2, 4);
    const board = deck.slice(4, 9);
    const hs = evaluate([...hero, ...board]);
    const vs = evaluate([...villain, ...board]);
    // prefer interesting boards: both players have at least a pair, or the result is a split
    const cmp = compareHands(hero, villain, board);
    const catH = describeScore(hs);
    const catV = describeScore(vs);
    if (t < 40 && (categoryOf(hs) < HandCategory.Pair || categoryOf(vs) < HandCategory.Pair)) continue;
    const answer = cmp > 0 ? 0 : cmp < 0 ? 1 : 2;
    return {
      id,
      kind: 'showdown',
      topic: 'Hand reading',
      prompt: 'Showdown. Who wins the pot?',
      hero,
      villain,
      board,
      options: ['You', 'Opponent', 'Split pot'],
      answer,
      explain: `You have ${lower(catH)}; your opponent has ${lower(catV)}. ${answer === 2 ? 'Your best five cards are the same, so the pot is split.' : categoryOf(hs) === categoryOf(vs) ? `Same type of hand, so the higher cards decide: ${answer === 0 ? 'yours' : 'theirs'} win.` : `${answer === 0 ? 'Your' : 'Their'} hand ranks higher.`}`,
      lesson: 'rules-rankings',
    };
  }
  throw new Error('unreachable');
}

function combosPuzzle(rng: Rng, id: string): Puzzle {
  const deck = rng.shuffle(fullDeck());
  const hero = deck.slice(0, 2);
  const ranks = 'AKQJT98765432';
  const r1 = cardToString(hero[0])[0];
  const r2 = cardToString(hero[1])[0];
  const other = rng.pick([...ranks].filter((r) => r !== r1 && r !== r2));
  const candidates: HandClass[] = [
    `${r1}${r1}`,
    ranks.indexOf(r1) < ranks.indexOf(other) ? `${r1}${other}` : `${other}${r1}`,
    `${other}${other}`,
  ].filter((h) => h.length === 2);
  if (r1 !== r2) candidates.push(ranks.indexOf(r1) < ranks.indexOf(r2) ? `${r1}${r2}` : `${r2}${r1}`);
  const h = rng.pick(candidates);
  const all = h[0] === h[1] ? combosOf(h) : [...combosOf(`${h}s`), ...combosOf(`${h}o`)];
  const n = all.filter(([a, b]) => !hero.includes(a) && !hero.includes(b)).length;
  const full = all.length;
  const wrong = [...new Set([full, n + 3, Math.max(1, n - 3), n * 2, n + 1, n + 6].filter((x) => x !== n && x > 0))].slice(0, 3).map(String);
  const { options, answer } = shuffleOptions(rng, String(n), wrong);
  const name = h[0] === h[1] ? `pocket ${h[0] === 'T' ? '10' : h[0]}s (${h})` : `${h} (any suits)`;
  return {
    id,
    kind: 'combos',
    topic: 'Combinatorics',
    prompt: `You hold these two cards. How many combinations of ${name} can your opponent have?`,
    hero,
    options,
    answer,
    explain: `${h} has ${full} combinations in a full deck (${h[0] === h[1] ? '6 for a pair' : '16 for two different ranks'}). Removing every combination that uses one of your cards leaves ${n}.`,
    lesson: 'combinatorics',
  };
}

function bluffPuzzle(rng: Rng, id: string): Puzzle {
  const pot = rng.pick([8, 10, 12, 16, 20, 30]);
  const f = rng.pick([1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 1.5]);
  const bet = Math.round(pot * f * 2) / 2;
  const need = bet / (pot + bet);
  const correct = pct(need);
  // typical mistakes: the caller's price, and "a bluff must work half the time"
  const { options, answer } = shuffleOptions(rng, correct, percentDistractors(need, [bet / (pot + 2 * bet), 0.5]));
  return {
    id,
    kind: 'bluff',
    topic: 'Bluffing math',
    prompt: `River, the pot is ${bbs(pot)}. You bluff ${bbs(bet)} with a hand that cannot win at showdown. How often must your opponent fold for the bluff to break even?`,
    options,
    answer,
    explain: `You risk ${bbs(bet)} to win ${bbs(pot)}. Break-even fold rate = ${bbs(bet)} ÷ (${bbs(pot)} + ${bbs(bet)}) ≈ ${correct}.`,
    lesson: 'break-even-equity',
  };
}

function shovePuzzle(rng: Rng, id: string): Puzzle {
  const stack = rng.pick([6, 8, 10, 12, 15]);
  const chart = getChart(`pf-sb-shove-${stack}`)!;
  const h = clearEdgeHand(rng, (x) => chartFreq(chart, x).raise);
  const shove = chartFreq(chart, h).raise === 1;
  return {
    id,
    kind: 'shove',
    topic: 'Push/fold',
    prompt: `Tournament, heads-up against the big blind. You are in the small blind with ${stack}bb and it is your decision. Shove all-in or fold?`,
    hero: holdingFor(rng, h),
    options: ['Shove', 'Fold'],
    answer: shove ? 0 : 1,
    explain: `The computed push/fold chart for ${stack}bb ${shove ? 'shoves' : 'folds'} ${describeClass(h)} (${h}). At this depth it shoves about ${rangePercent(chart.raise).toFixed(0)}% of hands, because the blinds are worth winning and the big blind cannot call wide.`,
    lesson: 'push-fold',
  };
}

/** Local date key, e.g. 2026-10-29. */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Five puzzles for a day (or for any seed, for unranked extra sets). */
export function puzzleSet(key: string): Puzzle[] {
  const rng = createRng(hashString(`puzzles:${key}`));
  const last = rng.next() < 0.5 ? bluffPuzzle : shovePuzzle;
  const makers = [openPuzzle, potOddsPuzzle, showdownPuzzle, combosPuzzle, last];
  return makers.map((m, i) => m(rng, `${key}#${i}`));
}

// ---------------- results (stored in this browser) ----------------

export interface PuzzleRun {
  date: string;
  score: number;
  total: number;
  ms: number;
  at: number;
}

const KEY = 'felt-school:puzzles';

export function loadRuns(): PuzzleRun[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((r) => r && typeof r.date === 'string') : [];
  } catch {
    return [];
  }
}

export function saveRun(run: PuzzleRun): PuzzleRun[] {
  const runs = loadRuns().filter((r) => r.date !== run.date);
  runs.push(run);
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(-400)));
  } catch {
    /* storage unavailable */
  }
  return runs;
}

/** Consecutive days with a completed daily set, ending today or yesterday. */
export function streak(runs: PuzzleRun[], today = new Date()): number {
  const days = new Set(runs.map((r) => r.date));
  const d = new Date(today);
  if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(todayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
