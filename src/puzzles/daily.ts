// Daily puzzles: short multiple-choice questions whose answers are computed from the app's own
// charts, hand evaluator and formulas. The same date gives the same five puzzles to everyone.

import { Card, Rng, createRng, hashString, fullDeck, cardToString } from '../engine/cards';
import { compareHands, describeScore, evaluate, categoryOf, HandCategory, CATEGORY_NAMES } from '../engine/evaluator';
import { getChart, chartFreq, chartPlayRange } from '../ranges/presets';
import { ALL_CLASSES, HandClass, combosOf, rangePercent } from '../ranges/hands';
import { preflopRanking } from '../ranges/preflopEquity';

export interface Puzzle {
  id: string;
  kind: 'open' | 'potodds' | 'showdown' | 'combos' | 'bluff' | 'shove' | 'outs' | 'nuts';
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

const lower = (t: string) => {
  const l = t[0].toLowerCase() + t.slice(1);
  return /^(pair|flush|straight|full house|royal)/.test(l) ? `a ${l}` : l;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SUIT_SYM = ['♣', '♦', '♥', '♠'];
const prettyCard = (c: Card) => `${cardToString(c)[0] === 'T' ? '10' : cardToString(c)[0]}${SUIT_SYM[c & 3]}`;
const RANK_PLURAL: Record<string, string> = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', T: 'Tens', '9': 'Nines', '8': 'Eights', '7': 'Sevens', '6': 'Sixes', '5': 'Fives', '4': 'Fours', '3': 'Threes', '2': 'Twos' };
const rankPlural = (r: string) => RANK_PLURAL[r] ?? `${r}s`;
/** "Queen-6 suited" → plain words for a starting hand. */
const handWords = (h: HandClass) => (h[0] === h[1] ? `pocket ${rankPlural(h[0]).toLowerCase()}` : `${h.slice(0, 2)}${h[2] === 's' ? ' suited' : h[2] === 'o' ? ' offsuit' : ''}`);
const SEAT_WORDS: Record<string, string> = {
  UTG: 'UTG (first to act)',
  HJ: 'the hijack (middle position)',
  CO: 'the cutoff (one seat before the button)',
  BTN: 'the button (last to act after the flop)',
};

function shuffleOptions(rng: Rng, correct: string, wrong: string[]): { options: string[]; answer: number } {
  const w = [...new Set(wrong)].filter((x) => x !== correct).slice(0, 3);
  const options = rng.shuffle([correct, ...w]);
  return { options, answer: options.indexOf(correct) };
}

/** Three distinct wrong percentages: common mistakes first, then nearby values. */
function percentDistractors(correct: number, mistakes: number[]): string[] {
  const c = pct(correct);
  const out: string[] = [];
  // skip "mistakes" so far off that nobody would pick them
  for (const m of [...mistakes.filter((x) => x <= 0.6), correct + 0.08, correct - 0.07, correct + 0.15, correct - 0.12, correct + 0.22]) {
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
    prompt: `6-max cash game, 100bb deep. It folds to you in ${SEAT_WORDS[pos]}. Raise or fold?`,
    hero: holdingFor(rng, h),
    options: ['Raise', 'Fold'],
    answer: opens ? 0 : 1,
    explain: `${opens ? 'Raise' : 'Fold'}. The ${pos} opens about ${share}% of hands, and ${handWords(h)} is ${opens ? 'inside' : 'outside'} that range. ${pos === 'UTG' ? 'Five players still act behind you, so the range is tight.' : pos === 'BTN' ? 'Only the blinds are left and you will have position, so the range is wide.' : 'The fewer players left behind you, the wider you can open.'}`,
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
  const bet = Math.max(1, Math.round(pot * f));
  const need = bet / (pot + 2 * bet);
  const correct = pct(need);
  // typical mistakes: bet ÷ (pot + bet) and bet ÷ pot
  const { options, answer } = shuffleOptions(rng, correct, percentDistractors(need, [bet / (pot + bet), bet / pot]));
  return {
    id,
    kind: 'potodds',
    topic: 'Pot odds',
    prompt: `River. The pot is ${pot}bb and your opponent bets ${bet}bb (${label}). What equity do you need to call — how often must you win?`,
    options,
    answer,
    explain: `You call ${bet}bb to win a final pot of ${pot + 2 * bet}bb (pot + their bet + your call). ${bet} ÷ ${pot + 2 * bet} ≈ ${correct}, so you need at least ${correct} equity to break even.`,
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
      topic: 'Showdown',
      prompt: 'Showdown on the river. Who wins the pot?',
      hero,
      villain,
      board,
      options: ['You', 'Opponent', 'Split pot'],
      answer,
      explain: `You have ${lower(catH)}; your opponent has ${lower(catV)}. ${answer === 2 ? 'The best five cards are the same, so the pot is split.' : categoryOf(hs) === categoryOf(vs) ? `Same hand type, so the kicker or higher cards decide: ${answer === 0 ? 'you' : 'they'} win.` : `${CATEGORY_NAMES[categoryOf(hs)]} ${answer === 0 ? 'beats' : 'loses to'} ${CATEGORY_NAMES[categoryOf(vs)].toLowerCase()}.`}`,
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
  const left = (r: string) => 4 - hero.filter((c) => cardToString(c)[0] === r).length;
  const why =
    h[0] === h[1]
      ? left(h[0]) === 4
        ? `A pocket pair has 6 combos, and you hold none of the ${rankPlural(h[0]).toLowerCase()}, so all 6 are possible.`
        : `A pocket pair has 6 combos. You hold ${4 - left(h[0])} of the ${rankPlural(h[0]).toLowerCase()}, leaving ${left(h[0])}, which make ${n} combo${n === 1 ? '' : 's'}. Card removal matters.`
      : `${h} has 16 combos in a full deck (4 × 4). After removing your cards: ${left(h[0])} × ${left(h[1])} = ${n}.`;
  return {
    id,
    kind: 'combos',
    topic: 'Combos',
    prompt: `You hold these two cards. How many combos (card combinations) of ${h} can your opponent have?`,
    hero,
    options,
    answer,
    explain: why,
    lesson: 'combinatorics',
  };
}

function bluffPuzzle(rng: Rng, id: string): Puzzle {
  const pot = rng.pick([8, 10, 12, 16, 20, 30]);
  const f = rng.pick([1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 1.5]);
  const bet = Math.max(1, Math.round(pot * f));
  const need = bet / (pot + bet);
  const correct = pct(need);
  // typical mistakes: the caller's price, and "a bluff must work half the time"
  const { options, answer } = shuffleOptions(rng, correct, percentDistractors(need, [bet / (pot + 2 * bet), 0.5]));
  return {
    id,
    kind: 'bluff',
    topic: 'Bluffing',
    prompt: `River. You missed and have nothing, so you bluff ${bet}bb into a ${pot}bb pot. How often does your opponent need to fold for the bluff to break even?`,
    options,
    answer,
    explain: `You risk ${bet}bb to win ${pot}bb. Break-even fold rate = ${bet} ÷ (${bet} + ${pot}) ≈ ${correct}. If they fold more often than that, the bluff makes money.`,
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
    prompt: `Tournament, heads-up. You are in the small blind with ${stack}bb. Shove all-in or fold?`,
    hero: holdingFor(rng, h),
    options: ['Shove', 'Fold'],
    answer: shove ? 0 : 1,
    explain: `${shove ? 'Shove' : 'Fold'}. At ${stack}bb the push/fold chart shoves about ${rangePercent(chart.raise).toFixed(0)}% of hands, and ${handWords(h)} ${shove ? 'makes the cut' : 'does not'}. Short stacks win a lot just by making the big blind fold.`,
    lesson: 'push-fold',
  };
}

function outsPuzzle(rng: Rng, id: string): Puzzle {
  // a flop where you have a draw (flush or open-ended) and no made straight or better
  for (let t = 0; t < 400; t++) {
    const deck = rng.shuffle(fullDeck());
    const hero = deck.slice(0, 2);
    const board = deck.slice(2, 5);
    const now = categoryOf(evaluate([...hero, ...board]));
    if (now > HandCategory.Pair) continue; // no two pair or better, so every out is a straight or flush card
    const unseen = deck.slice(5);
    const outs = unseen.filter((c) => categoryOf(evaluate([...hero, ...board, c])) >= HandCategory.Straight);
    const flushOuts = outs.filter((c) => categoryOf(evaluate([...hero, ...board, c])) === HandCategory.Flush || categoryOf(evaluate([...hero, ...board, c])) === HandCategory.StraightFlush).length;
    const n = outs.length;
    if (n < 4 || n > 15) continue;
    const kind = flushOuts >= 9 && n > flushOuts ? 'a combo draw (flush draw plus straight draw)' : flushOuts >= 9 ? 'a flush draw' : n >= 8 ? 'an open-ended straight draw' : 'a gutshot straight draw';
    const wrong = [...new Set([n + 1, n - 1, n + 4, n === 9 ? 8 : 9, n + 2].filter((x) => x !== n && x > 0))].slice(0, 3).map(String);
    const { options, answer } = shuffleOptions(rng, String(n), wrong);
    return {
      id,
      kind: 'outs',
      topic: 'Outs',
      prompt: 'Flop. How many outs do you have to make a straight or a flush on the turn?',
      hero,
      board,
      options,
      answer,
      explain: `You have ${kind}: ${n} outs${flushOuts && n > flushOuts ? ` (${flushOuts} flush cards plus ${n - flushOuts} straight cards)` : ''}. That is about ${pct(n / 47)} to hit on the turn and ${pct(1 - ((47 - n) / 47) * ((46 - n) / 46))} by the river (rule of 2 and 4: ${n * 2}% and ${n * 4}%).`,
      lesson: 'outs',
    };
  }
  return potOddsPuzzle(rng, id);
}

const NUTS_NAMES: Record<number, string> = {
  [HandCategory.StraightFlush]: 'Straight flush',
  [HandCategory.Quads]: 'Four of a kind',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Trips]: 'Three of a kind',
};

function nutsPuzzle(rng: Rng, id: string): Puzzle {
  const deck = rng.shuffle(fullDeck());
  const board = deck.slice(0, 5);
  const rest = deck.slice(5);
  let best = -1;
  let bestHole: Card[] = [];
  for (let a = 0; a < rest.length; a++)
    for (let b = a + 1; b < rest.length; b++) {
      const v = evaluate([...board, rest[a], rest[b]]);
      if (v > best) {
        best = v;
        bestHole = [rest[a], rest[b]];
      }
    }
  const cat = categoryOf(best);
  const correct = NUTS_NAMES[cat] ?? describeScore(best);
  const pool = Object.values(NUTS_NAMES).filter((x) => x !== correct);
  const wrong = rng.shuffle(pool).slice(0, 3);
  const { options, answer } = shuffleOptions(rng, correct, wrong);
  const paired = new Set(board.map((c) => cardToString(c)[0])).size < 5;
  return {
    id,
    kind: 'nuts',
    topic: 'The nuts',
    prompt: 'River. What are the nuts on this board — the best possible hand?',
    board,
    options,
    answer,
    explain: `The nuts is ${prettyCard(bestHole[0])} ${prettyCard(bestHole[1])} for ${lower(describeScore(best))}. ${paired ? 'A paired board makes full houses and quads possible.' : 'With no pair on the board, full houses and quads are impossible.'}`,
    lesson: 'rules-rankings',
  };
}

const ALL_MAKERS = [openPuzzle, potOddsPuzzle, showdownPuzzle, combosPuzzle, bluffPuzzle, shovePuzzle, outsPuzzle, nutsPuzzle];

/** One random puzzle of any kind (used by survival mode). */
export function randomPuzzle(key: string, index: number): Puzzle {
  const rng = createRng(hashString(`survival:${key}:${index}`));
  const make = ALL_MAKERS[Math.floor(rng.next() * ALL_MAKERS.length)];
  return make(rng, `${key}#${index}`);
}

// ---------------- scoring ----------------

export const BASE_POINTS = 100;
export const SPEED_WINDOW = { full: 5000, zero: 20000 };

/** Points for one answer: 100 for a correct answer, up to +50 for speed, times the combo multiplier. */
export function pointsFor(correct: boolean, ms: number, combo: number): number {
  if (!correct) return 0;
  const speed = ms <= SPEED_WINDOW.full ? 1 : ms >= SPEED_WINDOW.zero ? 0 : 1 - (ms - SPEED_WINDOW.full) / (SPEED_WINDOW.zero - SPEED_WINDOW.full);
  const mult = Math.min(2, 1 + 0.25 * Math.max(0, combo - 1));
  return Math.round((BASE_POINTS + 50 * speed) * mult);
}

/** Local date key, e.g. 2026-10-29. */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Five puzzles for a day (or for any seed, for unranked extra sets). */
export function puzzleSet(key: string): Puzzle[] {
  const rng = createRng(hashString(`puzzles:${key}`));
  // one preflop, one math, one reading question, then two more of any other kind
  const math = rng.pick([potOddsPuzzle, bluffPuzzle, combosPuzzle]);
  const reading = rng.pick([showdownPuzzle, nutsPuzzle, outsPuzzle]);
  const pre = rng.pick([openPuzzle, shovePuzzle]);
  const rest = rng.shuffle(ALL_MAKERS.filter((m) => m !== math && m !== reading && m !== pre)).slice(0, 2);
  const makers = [pre, math, reading, ...rest];
  return makers.map((m, i) => m(rng, `${key}#${i}`));
}

// ---------------- results (stored in this browser) ----------------

export interface PuzzleRun {
  id: string;
  mode: 'daily' | 'survival';
  date: string;
  points: number;
  correct: number;
  total: number;
  ms: number;
  at: number;
  /** one character per answer: 'o' correct, 'x' wrong */
  marks: string;
  /** legacy field from the first version */
  score?: number;
}

const KEY = 'felt-school:puzzles';

export function loadRuns(): PuzzleRun[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((r) => r && typeof r.date === 'string')
      .map((r) => ({
        id: r.id ?? `daily:${r.date}`,
        mode: r.mode ?? 'daily',
        date: r.date,
        points: typeof r.points === 'number' ? r.points : (r.score ?? 0) * BASE_POINTS,
        correct: typeof r.correct === 'number' ? r.correct : r.score ?? 0,
        total: r.total ?? 5,
        ms: r.ms ?? 0,
        at: r.at ?? 0,
        marks: r.marks ?? '',
      }));
  } catch {
    return [];
  }
}

export function saveRun(run: PuzzleRun): PuzzleRun[] {
  const runs = loadRuns().filter((r) => r.id !== run.id);
  runs.push(run);
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(-400)));
  } catch {
    /* storage unavailable: keep the run for this visit */
  }
  return runs;
}

/** Text for sharing a result, e.g. "Felt School daily · Oct 29 · 455 pts ✅✅❌✅✅". */
export function shareText(run: PuzzleRun, label: string): string {
  const marks = [...run.marks].map((m) => (m === 'o' ? '🟩' : '🟥')).join('');
  return `Felt School ${run.mode === 'daily' ? 'daily' : 'survival'} · ${label} · ${run.points} pts\n${marks}`;
}

// in-progress state, so a reload or redraw resumes instead of restarting
export interface PuzzleProgress {
  key: string;
  index: number;
  picks: (number | null)[];
  times: number[];
  points: number[];
  startedAt: number;
  lives?: number;
}
const PKEY = 'felt-school:puzzle-progress';
export function loadProgress(key: string): PuzzleProgress | null {
  try {
    const v = JSON.parse(localStorage.getItem(`${PKEY}:${key}`) ?? 'null');
    return v && v.key === key ? v : null;
  } catch {
    return null;
  }
}
export function saveProgress(key: string, p: PuzzleProgress | null) {
  try {
    if (p) localStorage.setItem(`${PKEY}:${key}`, JSON.stringify(p));
    else localStorage.removeItem(`${PKEY}:${key}`);
  } catch {
    /* ignore */
  }
}

/** Consecutive days with a completed daily set, ending today or yesterday. */
export function streak(runs: PuzzleRun[], today = new Date()): number {
  const days = new Set(runs.filter((r) => r.mode === 'daily').map((r) => r.date));
  const d = new Date(today);
  if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(todayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
