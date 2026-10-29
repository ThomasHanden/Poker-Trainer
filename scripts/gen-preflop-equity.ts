// Generates src/data/preflopEquity.json: a 169x169 table of all-in preflop equity of class i vs class j,
// estimated by Monte Carlo over random non-conflicting combos and random boards.
// Usage: npx vite-node scripts/gen-preflop-equity.ts [samplesPerPair]
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRng, deckWithout } from '../src/engine/cards';
import { evaluate } from '../src/engine/evaluator';
import { ALL_CLASSES, combosOf } from '../src/ranges/hands';

const N = Number(process.argv[2] ?? 2500);
const rng = createRng('preflop-equity-v1');
const n = ALL_CLASSES.length;
const eq = new Float64Array(n * n);
const compat = new Float64Array(n * n); // number of non-conflicting combo pairs
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  for (let j = i; j < n; j++) {
    const A = combosOf(ALL_CLASSES[i]);
    const B = combosOf(ALL_CLASSES[j]);
    const pairs: [number, number][] = [];
    for (let a = 0; a < A.length; a++)
      for (let b = 0; b < B.length; b++) {
        const x = A[a], y = B[b];
        if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) pairs.push([a, b]);
      }
    compat[i * n + j] = compat[j * n + i] = pairs.length;
    if (pairs.length === 0) { eq[i * n + j] = eq[j * n + i] = NaN; continue; }
    let sum = 0;
    for (let s = 0; s < N; s++) {
      const [a, b] = pairs[rng.int(pairs.length)];
      const h = A[a], v = B[b];
      const deck = deckWithout([h[0], h[1], v[0], v[1]]);
      for (let k = 0; k < 5; k++) { const r = k + rng.int(deck.length - k); const t = deck[k]; deck[k] = deck[r]; deck[r] = t; }
      const board = deck.slice(0, 5);
      const x = evaluate([h[0], h[1], ...board]);
      const y = evaluate([v[0], v[1], ...board]);
      sum += x > y ? 1 : x === y ? 0.5 : 0;
    }
    const e = sum / N;
    eq[i * n + j] = e;
    eq[j * n + i] = 1 - e;
  }
  if (i % 20 === 0) console.log(`row ${i}/${n} ${(Date.now() - t0) / 1000}s`);
}
mkdirSync('src/data', { recursive: true });
const toQ = (x: number) => (Number.isNaN(x) ? -1 : Math.round(x * 10000));
writeFileSync('src/data/preflopEquity.json', JSON.stringify({
  description: 'All-in preflop equity (x10000) of row class vs column class, ALL_CLASSES order. Monte Carlo estimate.',
  samplesPerPair: N,
  approxStdError: +(0.5 / Math.sqrt(N)).toFixed(4),
  generatedBy: 'scripts/gen-preflop-equity.ts',
  classes: ALL_CLASSES,
  equity: Array.from(eq, toQ),
  compatiblePairs: Array.from(compat),
}));
console.log('done', (Date.now() - t0) / 1000, 's');
