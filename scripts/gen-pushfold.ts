// Generates src/data/pushfold.json: the push/fold solutions for the standard stacks, with and without
// a big-blind ante, so the app and the live-table bots never wait for the solver.
// Re-run after regenerating the preflop equity table: npm run gen:pushfold
import { writeFileSync } from 'node:fs';
import { PUSHFOLD_STACKS, computePushFold } from '../src/ranges/pushfold';
import type { Range } from '../src/ranges/hands';

const ITERATIONS = 300;
const nonZero = (r: Range) => Object.fromEntries(Object.entries(r).filter(([, f]) => f > 0));
const solutions: Record<string, { shove: Partial<Range>; call: Partial<Range> }> = {};
for (const ante of [0, 1]) {
  for (const S of PUSHFOLD_STACKS) {
    const sol = computePushFold(S, ante, ITERATIONS);
    solutions[`${S}:${ante}`] = { shove: nonZero(sol.shove), call: nonZero(sol.call) };
  }
}
writeFileSync('src/data/pushfold.json', JSON.stringify({ iterations: ITERATIONS, solutions }) + '\n');
console.log(`wrote ${Object.keys(solutions).length} solutions`);
