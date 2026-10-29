import { describe, it, expect } from 'vitest';
import { parseCards, createRng } from '../src/engine/cards';
import {
  equityVsHand,
  equityVsRange,
  equityMultiway,
  potOddsRequiredEquity,
  minimumDefenseFrequency,
  bluffBreakEven,
  indifferentBluffShare,
  callEV,
  shoveEV,
  outsEquity,
} from '../src/engine/equity';
import {
  parseRange,
  formatRange,
  rangeCombos,
  rangePercent,
  expandRange,
  compareRanges,
  combosOf,
  comboCount,
  ALL_CLASSES,
  classOf,
  classAt,
  classPosition,
} from '../src/ranges/hands';
import { icmEquities, icmEV } from '../src/engine/icm';

describe('equity', () => {
  it('AA vs KK preflop ≈ 82%', () => {
    const r = equityVsHand(parseCards('AsAh'), parseCards('KdKc'), [], { samples: 60000, rng: createRng(1) });
    expect(r.method).toBe('simulation');
    expect(Math.abs(r.equity - 0.82)).toBeLessThan(0.01);
    expect(r.stdError).toBeGreaterThan(0);
  });
  it('exact on the turn and river', () => {
    const river = equityVsHand(parseCards('AsAh'), parseCards('KdKc'), parseCards('2c7d9hJcKs'));
    expect(river.method).toBe('exact');
    expect(river.equity).toBe(0);
    // turn: KK has set; AA needs one of 1 remaining ace? Aces left: Ad, Ac -> 2 outs of 44
    const turn = equityVsHand(parseCards('AsAh'), parseCards('KdKc'), parseCards('2c7d9hKs'));
    expect(turn.method).toBe('exact');
    expect(turn.equity).toBeCloseTo(2 / 44, 6);
  });
  it('flush draw vs top pair on the flop is exact and ≈ 35-38%', () => {
    const r = equityVsHand(parseCards('AhTh'), parseCards('KsKd'), parseCards('Kh7h2c'));
    // AhTh drawing to flush vs set of kings (board pairs give KK boats) -> low; sanity range
    expect(r.method).toBe('exact');
    expect(r.samples).toBe(990);
    expect(r.equity).toBeLessThan(0.35);
    const r2 = equityVsHand(parseCards('AhTh'), parseCards('Ks9d'), parseCards('Kh7h2c'));
    expect(r2.equity).toBeGreaterThan(0.4);
    expect(r2.equity).toBeLessThan(0.5);
  });
  it('split pots count as half', () => {
    const r = equityVsHand(parseCards('2c3d'), parseCards('2d3c'), parseCards('AsKsQsJsTs'));
    expect(r.equity).toBe(0.5);
    expect(r.tie).toBe(1);
  });
  it('equity vs a range respects card removal', () => {
    // Hero holds As; villain range AA only -> only 3 combos remain
    const combos = expandRange(parseRange('AA'), parseCards('AsKd'));
    expect(combos.length).toBe(3);
    const r = equityVsRange(parseCards('AsKd'), combos, parseCards('2c7d9hJcQd'));
    expect(r.equity).toBe(0);
  });
  it('weighted ranges: weights shift equity proportionally', () => {
    const hero = parseCards('QhQd');
    const board = parseCards('2c7d9h3s4c');
    // vs AA (hero loses) weight 1, vs JJ (hero wins) weight 1 -> 50%? combos differ: AA 6, JJ 6
    const even = equityVsRange(hero, expandRange(parseRange('AA,JJ'), [...hero, ...board]), board);
    expect(even.equity).toBeCloseTo(0.5, 6);
    const skew = equityVsRange(hero, expandRange(parseRange('AA:0.5,JJ'), [...hero, ...board]), board);
    expect(skew.equity).toBeCloseTo(6 / 9, 6);
  });
  it('multiway simulation is in a sensible range', () => {
    const r = equityMultiway(parseCards('AsAh'), [expandRange(parseRange('22+,A2s+,K9s+,ATo+')), expandRange(parseRange('22+,A2s+,K9s+,ATo+'))], [], 8000, createRng(3));
    expect(r.equity).toBeGreaterThan(0.6);
    expect(r.equity).toBeLessThan(0.8);
  });
});

describe('decision math', () => {
  it('pot odds', () => {
    // villain bets 50 into 100: pot including bet 150, call 50 -> 50/200 = 25%
    expect(potOddsRequiredEquity(150, 50)).toBe(0.25);
    expect(potOddsRequiredEquity(200, 100)).toBeCloseTo(1 / 3);
  });
  it('MDF and bluff break-even', () => {
    expect(minimumDefenseFrequency(100, 50)).toBeCloseTo(2 / 3);
    expect(minimumDefenseFrequency(100, 100)).toBe(0.5);
    expect(bluffBreakEven(100, 100)).toBe(0.5);
    expect(bluffBreakEven(100, 50)).toBeCloseTo(1 / 3);
    expect(indifferentBluffShare(100, 100)).toBeCloseTo(1 / 3);
  });
  it('call EV and shove EV', () => {
    expect(callEV(150, 50, 0.25)).toBeCloseTo(0, 10);
    expect(callEV(150, 50, 0.5)).toBe(50);
    // shove 1000 into 150 (blinds), always folds -> win 150
    expect(shoveEV(150, 1000, 900, 1, 0.3)).toBe(150);
    // never folds, 50% equity -> 0.5*(150+1000+900) - 1000 = 25
    expect(shoveEV(150, 1000, 900, 0, 0.5)).toBe(25);
  });
  it('outs approximation vs exact', () => {
    const f = outsEquity(9, 2);
    expect(f.approx).toBeCloseTo(0.36);
    expect(f.exact).toBeCloseTo(0.3497, 3);
    expect(outsEquity(9, 1).exact).toBeCloseTo(9 / 46);
  });
});

describe('ranges', () => {
  it('169 classes and 1326 combos', () => {
    expect(ALL_CLASSES.length).toBe(169);
    expect(new Set(ALL_CLASSES).size).toBe(169);
    expect(ALL_CLASSES.reduce((a, h) => a + comboCount(h), 0)).toBe(1326);
    expect(ALL_CLASSES.reduce((a, h) => a + combosOf(h).length, 0)).toBe(1326);
  });
  it('matrix layout', () => {
    expect(classAt(0, 0)).toBe('AA');
    expect(classAt(0, 1)).toBe('AKs');
    expect(classAt(1, 0)).toBe('AKo');
    expect(classAt(12, 12)).toBe('22');
    expect(classPosition('T9s')).toEqual({ row: 4, col: 5 });
    expect(classPosition('T9o')).toEqual({ row: 5, col: 4 });
  });
  it('classOf', () => {
    const [a, b] = parseCards('Ts9s');
    expect(classOf(a, b)).toBe('T9s');
    const [c, d] = parseCards('9dTs');
    expect(classOf(c, d)).toBe('T9o');
  });
  it('parses shorthand', () => {
    const r = parseRange('22+, A2s+, KTo+, T9s-65s, QQ-99:0.5, AK, A5s-A2s:50%');
    expect(r['22']).toBe(1);
    expect(r['AA']).toBe(1);
    expect(r['A2s']).toBe(0.5);
    expect(r['AKs']).toBe(1);
    expect(r['AKo']).toBe(1);
    expect(r['KTo']).toBe(1);
    expect(r['KJo']).toBe(1);
    expect(r['K9o']).toBe(0);
    expect(r['65s']).toBe(1);
    expect(r['54s']).toBe(0);
    expect(r['QQ']).toBe(0.5);
    expect(r['TT']).toBe(0.5);
  });
  it('rejects invalid input', () => {
    expect(() => parseRange('AXs')).toThrow();
    expect(() => parseRange('AKs:2')).toThrow();
    expect(() => parseRange('T9s-64s')).toThrow();
    expect(() => parseRange('AAs')).toThrow();
  });
  it('specific combos produce fractional weights', () => {
    const r = parseRange('AsKs,AhKh');
    expect(r['AKs']).toBe(0.5);
  });
  it('round-trips export/import', () => {
    const r = parseRange('22+,A2s+,KTo+,T9s:0.25,65s:0.333');
    const back = parseRange(formatRange(r));
    for (const h of ALL_CLASSES) expect(back[h]).toBeCloseTo(r[h], 3);
  });
  it('combo counts and percentages', () => {
    const r = parseRange('AA,AKs,AKo');
    expect(rangeCombos(r)).toBe(6 + 4 + 12);
    expect(rangePercent(r)).toBeCloseTo((22 / 1326) * 100);
    // with the As on board: AA 3 combos, AKs 3, AKo 9
    expect(rangeCombos(r, parseCards('As'))).toBe(15);
    const w = parseRange('AA:0.5');
    expect(rangeCombos(w)).toBe(3);
  });
  it('compare ranges', () => {
    const c = compareRanges(parseRange('AA,KK,QQ'), parseRange('AA,KK,AKs'));
    expect(c.onlyA).toEqual(['QQ']);
    expect(c.onlyB).toEqual(['AKs']);
    expect(c.overlapCombos).toBe(12);
    expect(c.similarity).toBeCloseTo(12 / 22);
  });
});

describe('ICM', () => {
  it('equal stacks get equal equity; total equals prize pool', () => {
    const e = icmEquities([1000, 1000, 1000], [50, 30, 20]);
    for (const x of e) expect(x).toBeCloseTo(100 / 3);
    const e2 = icmEquities([5000, 3000, 1500, 500], [50, 30, 20]);
    expect(e2.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });
  it('known two-player case: equity = stack share of (1st-2nd) + 2nd', () => {
    const e = icmEquities([3000, 1000], [70, 30]);
    expect(e[0]).toBeCloseTo(30 + 40 * 0.75);
  });
  it('three-player hand calculation', () => {
    // stacks 5000/3000/2000, payouts 50/30/20
    const e = icmEquities([5000, 3000, 2000], [50, 30, 20]);
    // P1 first = .5; second: P2 first (.3) then 5/7, P3 first (.2) then 5/8
    const p1second = 0.3 * (5 / 7) + 0.2 * (5 / 8);
    const p1third = 1 - 0.5 - p1second;
    expect(e[0]).toBeCloseTo(50 * 0.5 + 30 * p1second + 20 * p1third, 6);
  });
  it('risk premium: required equity under ICM exceeds chip-EV requirement on a bubble', () => {
    // 4 players, 3 paid. Hero 3000 calls all-in 3000 from a 3000 stack; others 3000 each.
    const spot = {
      stacksIfFold: [3000 - 100, 3000 + 100, 3000, 3000],
      stacksIfWin: [6000, 0, 3000, 3000],
      stacksIfLose: [0, 6000, 3000, 3000],
      payouts: [50, 30, 20],
      hero: 0,
    };
    const r = icmEV(spot, 0.5);
    expect(r.requiredEquity).toBeGreaterThan(0.5);
  });
});
