// Daily puzzles: short multiple-choice questions whose answers are computed from the app's own
// charts, hand evaluator and formulas. The same date gives the same five puzzles to everyone.

import { Card, Rng, createRng, hashString, fullDeck, cardToString } from '../engine/cards';
import { compareHands, describeScore, evaluate, categoryOf, HandCategory } from '../engine/evaluator';
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
const chips = (x: number) => `${+x.toFixed(1)} chips`;
const RANK_WORD: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' };
const rankWord = (r: string) => RANK_WORD[r] ?? r;
const RANK_PLURAL: Record<string, string> = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', T: 'Tens', '9': 'Nines', '8': 'Eights', '7': 'Sevens', '6': 'Sixes', '5': 'Fives', '4': 'Fours', '3': 'Threes', '2': 'Twos' };
const rankPlural = (r: string) => RANK_PLURAL[r] ?? `${r}s`;
/** "Queen-6 suited" → plain words for a starting hand. */
const handWords = (h: HandClass) => (h[0] === h[1] ? `a pair of ${rankPlural(h[0])}` : `${rankWord(h[0])}-${rankWord(h[1])}${h[2] === 's' ? ' of the same suit' : ''}`);
const SEAT_WORDS: Record<string, string> = {
  UTG: 'first to act, with five players still to come after you',
  HJ: 'in the middle of the table, with four players still to come',
  CO: 'one seat before the dealer, with three players still to come',
  BTN: 'on the dealer button, the best seat, with only the two blinds left',
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
  for (const m of [...mistakes.filter((x) => x <= 0.8), correct + 0.08, correct - 0.07, correct + 0.15, correct - 0.12, correct + 0.22]) {
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
    topic: 'Starting hands',
    prompt: `Six players at the table. Everyone before you folded. You are ${SEAT_WORDS[pos]}. Do you raise or fold this hand?`,
    hero: holdingFor(rng, h),
    options: ['Raise', 'Fold'],
    answer: opens ? 0 : 1,
    explain: `${opens ? 'Raise' : 'Fold'}. From this seat a good player plays about ${share}% of hands, and ${handWords(h)} ${opens ? 'is good enough' : 'is not good enough'}. ${pos === 'UTG' ? 'With so many players still to act, someone often has a strong hand, so you play tight.' : pos === 'BTN' ? 'Only two players are left and you act last after the flop, so you can play lots of hands.' : 'The fewer players left behind you, the more hands you can play.'}`,
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
    topic: 'Calling math',
    prompt: `All the cards are out. There are ${chips(pot)} in the pot and your opponent bets ${chips(bet)} (${label}). To make calling worth it, how often do you need to win?`,
    options,
    answer,
    explain: `You pay ${bet} to win a total pot of ${pot + 2 * bet} (the ${pot} already there, their ${bet} and your ${bet}). ${bet} out of ${pot + 2 * bet} is about ${correct}, so you need to win at least that often for the call to pay off.`,
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
      topic: 'Who wins?',
      prompt: 'All five shared cards are out and both players show their hands. Who wins?',
      hero,
      villain,
      board,
      options: ['You', 'Opponent', 'Split pot'],
      answer,
      explain: `You have ${lower(catH)}. Your opponent has ${lower(catV)}. ${answer === 2 ? 'Your best five cards are the same, so you split the pot.' : categoryOf(hs) === categoryOf(vs) ? `You both have the same kind of hand, so the higher cards win: ${answer === 0 ? 'yours' : 'theirs'}.` : `${answer === 0 ? 'Your' : 'Their'} kind of hand beats ${answer === 0 ? 'theirs' : 'yours'}.`}`,
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
  const name = h[0] === h[1] ? `a pair of ${rankPlural(h[0])}` : `a ${rankWord(h[0])} and a ${rankWord(h[1])}`;
  const why =
    h[0] === h[1]
      ? left(h[0]) === 4
        ? `There are four ${rankPlural(h[0])} in the deck, which can be paired up 6 different ways. You hold none of them, so all 6 are possible.`
        : `Normally the four ${rankPlural(h[0])} can be paired up 6 ways. You hold ${4 - left(h[0])} of them, so only ${left(h[0])} are left, and those can be paired up ${n} way${n === 1 ? '' : 's'}.`
      : `Any of the ${left(h[0])} ${rankPlural(h[0])} left can go with any of the ${left(h[1])} ${rankPlural(h[1])} left: ${left(h[0])} × ${left(h[1])} = ${n}.${left(h[0]) + left(h[1]) < 8 ? ' Your cards took some away; with a full deck it would be 4 × 4 = 16.' : ''}`;
  return {
    id,
    kind: 'combos',
    topic: 'Counting hands',
    prompt: `You hold these two cards. In how many different ways could your opponent be holding ${name}?`,
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
    prompt: `All the cards are out and your hand is too weak to win. There are ${chips(pot)} in the pot. You bet ${chips(bet)} to try to make your opponent give up. How often must they fold for this to pay off?`,
    options,
    answer,
    explain: `You risk ${bet} to win the ${pot} in the pot. ${bet} out of ${bet + pot} (what you risk plus what you win) is about ${correct}, so they need to fold at least that often.`,
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
    topic: 'All-in or fold',
    prompt: `Tournament, just you and one opponent. You have only ${stack} big blinds left, and you act first. Go all-in or fold?`,
    hero: holdingFor(rng, h),
    options: ['All-in', 'Fold'],
    answer: shove ? 0 : 1,
    explain: `${shove ? 'Go all-in' : 'Fold'}. With ${stack} big blinds, the best strategy goes all-in with about ${rangePercent(chart.raise).toFixed(0)}% of hands, and ${handWords(h)} ${shove ? 'is one of them' : 'is not'}. Going all-in often works because your opponent has to fold most of their hands.`,
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
    const kind = flushOuts >= 9 && n > flushOuts ? 'four cards to a flush and to a straight' : flushOuts >= 9 ? 'four cards of the same suit (one away from a flush)' : n >= 8 ? 'four cards in a row (a straight with either end)' : 'a straight missing one middle card';
    const wrong = [...new Set([n + 1, n - 1, n + 4, n === 9 ? 8 : 9, n + 2].filter((x) => x !== n && x > 0))].slice(0, 3).map(String);
    const { options, answer } = shuffleOptions(rng, String(n), wrong);
    return {
      id,
      kind: 'outs',
      topic: 'Drawing',
      prompt: 'Three shared cards are out. How many of the cards still in the deck would give you a straight or a flush on the next card?',
      hero,
      board,
      options,
      answer,
      explain: `You have ${kind}. ${n} of the 47 cards you can’t see would complete it${flushOuts && n > flushOuts ? ` (${flushOuts} for the flush and ${n - flushOuts} more for the straight)` : ''}. That gives you about ${pct(n / 47)} on the next card, and about ${pct(1 - ((47 - n) / 47) * ((46 - n) / 46))} if you see both of the last two cards.`,
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
    topic: 'Best hand',
    prompt: 'Look at these five shared cards. What is the best hand anyone at the table could possibly have?',
    board,
    options,
    answer,
    explain: `The best possible hand is ${prettyCard(bestHole[0])} ${prettyCard(bestHole[1])}, which makes ${lower(describeScore(best))}. ${paired ? 'Two shared cards are the same rank, so a full house or four of a kind is possible.' : 'No two shared cards are the same rank, so nobody can have a full house or four of a kind.'}`,
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
