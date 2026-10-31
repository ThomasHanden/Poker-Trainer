import { describe, it, expect } from 'vitest';
import { ALL_CHARTS, allChartsIncludingComputed, chartPlayRange, chartTotals, getChart, reachWeight } from '../src/ranges/presets';
import { ALL_CLASSES, comboCount, combosOf, expandRange, parseRange } from '../src/ranges/hands';
import { solvePushFold, computePushFold, PUSHFOLD_STACKS } from '../src/ranges/pushfold';
import { classEquity, compatiblePairs } from '../src/ranges/preflopEquity';
import { explainPreflopHand } from '../src/scenarios/templates/helpers';
import { EQUITY_EXAMPLES } from '../src/ranges/equityExamples';
import { createRng, parseCards } from '../src/engine/cards';
import { equityVsRange } from '../src/engine/equity';
import { evaluate } from '../src/engine/evaluator';
import { buildDrill, MatrixDrill, flopCategory } from '../src/ranges/practice';

const share = (r: Record<string, number>) => ALL_CLASSES.reduce((a, h) => a + (r[h] ?? 0) * comboCount(h), 0) / 1326;

describe('chart structure', () => {
  it('charts with a reach range only play hands that can reach the spot', () => {
    for (const c of ALL_CHARTS.filter((x) => x.reach)) {
      for (const h of ALL_CLASSES) if ((c.raise[h] ?? 0) + (c.call[h] ?? 0) > 0) expect(reachWeight(c, h), `${c.id} ${h}`).toBeGreaterThan(0);
      expect(c.reachLabel, c.id).toBeTruthy();
    }
    // the spots you can only reach by raising first
    for (const id of ['cash6-BTN-open-vs-BB-3bet', 'cash6-UTG-open-vs-BTN-3bet', 'cash6-BB-3bet-vs-BTN-4bet']) expect(getChart(id)!.reach, id).toBeTruthy();
  });

  it('totals split the reaching hands into raise, call and fold', () => {
    for (const c of allChartsIncludingComputed()) {
      const t = chartTotals(c);
      expect(t.raise + t.call + t.fold, c.id).toBeCloseTo(t.reach, 6);
      if (!c.reach) expect(t.reach, c.id).toBe(1326);
    }
    const dead = parseCards('As Kd');
    const t = chartTotals(getChart('cash6-open-UTG')!, dead);
    expect(t.all).toBe(1225);
    expect(t.reach).toBe(1225);
  });

  it('the played range of a reactive spot is weighted by how often each hand gets there', () => {
    const c = getChart('cash6-BB-3bet-vs-BTN-4bet')!;
    // JJ always continues vs the 4-bet, but the BB only 3-bets it part of the time
    expect(c.call['JJ'] + c.raise['JJ']).toBe(1);
    expect(reachWeight(c, 'JJ')).toBeLessThan(1);
    expect(chartPlayRange(c)['JJ']).toBeCloseTo(reachWeight(c, 'JJ'), 6);
    expect(chartPlayRange(c)['72o']).toBe(0);
  });

  it('has a facing-a-raise chart for every 6-max seat vs every earlier raiser, with flat calls explained', () => {
    const seats = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    for (let d = 1; d < seats.length; d++) {
      const continueShare: number[] = [];
      for (let o = 0; o < d; o++) {
        const c = getChart(`cash6-${seats[d]}-vs-${seats[o]}`);
        expect(c, `${seats[d]} vs ${seats[o]}`).toBeTruthy();
        expect(c!.callWhy, c!.id).toBeTruthy();
        expect(chartTotals(c!).call, c!.id).toBeGreaterThan(0);
        const t = chartTotals(c!);
        continueShare.push(t.raise + t.call);
      }
      // later raisers open wider, so each seat continues with more hands against them
      for (let i = 0; i + 1 < continueShare.length; i++) expect(continueShare[i], `${seats[d]} vs ${seats[i]} / ${seats[i + 1]}`).toBeLessThan(continueShare[i + 1]);
    }
  });

  it('facing-a-raise totals match published 100bb solver summaries (within 1.5 points)', () => {
    // [3-bet %, call %] of all hands; BeyondGTO 6-max 100bb defense table (its LJ = our 6-max UTG)
    const ref: Record<string, [number, number]> = {
      'HJ-UTG': [6, 4], 'CO-HJ': [8, 5], 'BTN-CO': [10, 9], 'SB-BTN': [13, 5],
      'BB-UTG': [6, 21], 'BB-HJ': [8, 23], 'BB-CO': [10, 26], 'BB-BTN': [13, 32], 'BB-SB': [17, 39],
    };
    for (const [k, [r, c]] of Object.entries(ref)) {
      const [pos, vs] = k.split('-');
      const t = chartTotals(getChart(`cash6-${pos}-vs-${vs}`)!);
      expect(Math.abs((100 * t.raise) / 1326 - r), `${k} 3-bet`).toBeLessThan(1.5);
      expect(Math.abs((100 * t.call) / 1326 - c), `${k} call`).toBeLessThan(1.5);
    }
  });

  it('opening ranges widen seat by seat', () => {
    const chains = [
      ['UTG', 'HJ', 'CO', 'BTN'].map((p) => `cash6-open-${p}`),
      ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'].map((p) => `cash9-open-${p}`),
    ];
    for (const chain of chains)
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = getChart(chain[i])!.raise;
        const b = getChart(chain[i + 1])!.raise;
        for (const h of ALL_CLASSES) expect(a[h], `${chain[i]} vs ${chain[i + 1]}: ${h}`).toBeLessThanOrEqual(b[h]);
      }
    expect(share(getChart('cashhu-open-BTN')!.raise)).toBeGreaterThan(0.75);
  });
});

describe('push/fold model', () => {
  for (const ante of [0, 1])
    for (const S of PUSHFOLD_STACKS)
      it(`${S}bb${ante ? ' with a 1bb BB ante' : ''} is close to an equilibrium`, () => {
        const sol = solvePushFold(S, ante);
        const matched = S - ante;
        const pot = 2 * matched + ante;
        let gain = 0; // best-response gain of both players, bb per hand
        for (const j of ALL_CLASSES) {
          let num = 0, den = 0, all = 0;
          for (const i of ALL_CLASSES) {
            const c = compatiblePairs(i, j);
            all += c;
            const w = sol.shove[i] * c;
            if (w) { num += w * classEquity(j, i); den += w; }
          }
          if (!den) continue;
          const call = (num / den) * pot, fold = S - 1 - ante;
          gain += comboCount(j) * (den / all) * (Math.max(call, fold) - (sol.call[j] * call + (1 - sol.call[j]) * fold));
        }
        for (const i of ALL_CLASSES) {
          let pc = 0, eq = 0, all = 0;
          for (const j of ALL_CLASSES) {
            const c = compatiblePairs(i, j);
            all += c;
            pc += sol.call[j] * c;
            eq += sol.call[j] * c * classEquity(i, j);
          }
          const p = pc / all;
          const shove = (1 - p) * (S + 1 + ante) + p * (S - matched + (pc ? eq / pc : 0) * pot);
          const fold = S - 0.5;
          gain += comboCount(i) * (Math.max(shove, fold) - (sol.shove[i] * shove + (1 - sol.shove[i]) * fold));
        }
        expect(gain / 1326).toBeLessThan(0.01);
      });

  it('the generated table (src/data/pushfold.json) matches the solver; rerun npm run gen:pushfold if not', () => {
    for (const ante of [0, 1])
      for (const S of PUSHFOLD_STACKS) {
        const fresh = computePushFold(S, ante);
        const sol = solvePushFold(S, ante);
        expect(sol.shove, `${S}bb ante ${ante} shove`).toEqual(fresh.shove);
        expect(sol.call, `${S}bb ante ${ante} call`).toEqual(fresh.call);
      }
  });

  it('an ante makes both players looser, and deeper stacks make them tighter', () => {
    for (const S of PUSHFOLD_STACKS) {
      expect(share(solvePushFold(S, 1).shove), `${S}bb shove`).toBeGreaterThan(share(solvePushFold(S, 0).shove));
      expect(share(solvePushFold(S, 1).call), `${S}bb call`).toBeGreaterThan(share(solvePushFold(S, 0).call));
    }
    for (let i = 0; i + 1 < PUSHFOLD_STACKS.length; i++)
      for (const ante of [0, 1]) expect(share(solvePushFold(PUSHFOLD_STACKS[i + 1], ante).shove)).toBeLessThan(share(solvePushFold(PUSHFOLD_STACKS[i], ante).shove));
  });
});

describe('range text', () => {
  it('later tokens override earlier ones, down to single combos', () => {
    expect(parseRange('AKs,AsKs:0.5')['AKs']).toBeCloseTo(0.875, 6);
    expect(parseRange('AsKs:0.5,AKs')['AKs']).toBe(1);
    expect(parseRange('AsKs,AhKh')['AKs']).toBe(0.5);
    expect(parseRange('KsAs')['AKs']).toBe(0.25);
  });
});

describe('hand explanations', () => {
  const text = (h: string) => explainPreflopHand(h, { raise: 1, call: 0, fold: 0 }).join(' ');
  it('describe each hand type correctly', () => {
    expect(text('AKo')).not.toMatch(/weak/);
    expect(text('AKs')).toMatch(/strongest unpaired hand/);
    expect(text('AQo')).toMatch(/AK dominates it/);
    expect(text('A5o')).not.toMatch(/suited/i);
    expect(text('A5s')).toMatch(/wheel/);
    expect(text('TT')).toMatch(/Medium pairs/);
    expect(text('55')).toMatch(/11\.8%/);
    // KK: 1 - C(46,3)/C(50,3) = 22.6% of flops bring an ace
    expect(text('KK')).toMatch(/23% of the time/);
    expect(text('KJo')).toMatch(/AK, KQ, AJ/);
    expect(text('T9s')).toMatch(/4 different straights/);
    expect(text('AKs')).not.toMatch(/different straights/);
  });
  it('say when a hand cannot be in the spot', () => {
    const c = getChart('cash6-BTN-open-vs-BB-3bet')!;
    expect(explainPreflopHand('72o', { raise: 0, call: 0, fold: 1 }, c).join(' ')).toMatch(/not part of your BTN opening range/);
  });
});

describe('equity calculator examples', () => {
  it('only use cards that can exist, and the lessons match the numbers', () => {
    const eq: Record<string, number> = {};
    for (const x of EQUITY_EXAMPLES) {
      const hero = parseCards(x.hero);
      const board = x.board ? parseCards(x.board) : [];
      const seen = new Set([...hero, ...board]);
      expect(seen.size, x.label).toBe(hero.length + board.length);
      for (const tok of x.range.split(',')) {
        if (!/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(tok)) continue;
        for (const c of parseCards(tok.slice(0, 2) + ' ' + tok.slice(2))) expect(seen.has(c), `${x.label}: ${tok} uses a card that is already out`).toBe(false);
      }
      const combos = expandRange(parseRange(x.range), [...hero, ...board]);
      expect(combos.length, x.label).toBeGreaterThan(0);
      eq[x.label] = equityVsRange(hero, combos, board, { samples: 20000, rng: createRng(3) }).equity;
    }
    expect(eq['AKs vs QQ']).toBeGreaterThan(0.42);
    expect(eq['AKs vs QQ']).toBeLessThan(0.5);
    // the lesson says the real figure is below the rule-of-4 estimate of 48%
    expect(eq['Flush draw on the flop']).toBeLessThan(0.48);
    expect(eq['Top pair vs a c-bet range']).toBeGreaterThan(0.65);
    expect(eq['Overpair vs a turn raise']).toBeLessThan(0.35);
  });
});

describe('river call drill', () => {
  it('only offers hands that flopped a pair or better with a hole card', () => {
    for (const seed of [11, 22, 33]) {
      const d = buildDrill('continue', seed) as MatrixDrill;
      const flop = d.board.slice(0, 3);
      const boardCat = flopCategory(flop);
      expect(d.candidates.length).toBeGreaterThan(0);
      for (const h of d.candidates) {
        const live = combosOf(h).filter(([a, b]) => !d.board.includes(a) && !d.board.includes(b));
        const paired = live.filter((hc) => Math.floor(evaluate([...hc, ...flop]) / 16 ** 5) > boardCat).length;
        expect(paired * 2, h).toBeGreaterThanOrEqual(live.length);
      }
      for (const h of d.reference.select) expect(d.candidates).toContain(h);
    }
  });
});
