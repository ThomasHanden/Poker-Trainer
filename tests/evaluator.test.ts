import { describe, it, expect } from 'vitest';
import { parseCards, fullDeck, createRng } from '../src/engine/cards';
import { evaluate, categoryOf, HandCategory, describeScore } from '../src/engine/evaluator';

const ev = (s: string) => evaluate(parseCards(s));
const cat = (s: string) => categoryOf(ev(s));

describe('hand categories', () => {
  it('recognizes each category', () => {
    expect(cat('As Ks Qs Js Ts 2c 3d')).toBe(HandCategory.StraightFlush);
    expect(cat('9h 9d 9s 9c 2d 3c 4h')).toBe(HandCategory.Quads);
    expect(cat('Kh Kd Ks 2c 2d 7h 8s')).toBe(HandCategory.FullHouse);
    expect(cat('Ah 9h 6h 3h 2h Kd Qc')).toBe(HandCategory.Flush);
    expect(cat('9c Td Jh Qs Kd 2c 2d')).toBe(HandCategory.Straight);
    expect(cat('7c 7d 7h As Kd 2c 4d')).toBe(HandCategory.Trips);
    expect(cat('7c 7d 4h 4s Kd 2c 9d')).toBe(HandCategory.TwoPair);
    expect(cat('7c 7d 4h 3s Kd 2c 9d')).toBe(HandCategory.Pair);
    expect(cat('Ac Td 4h 3s Kd 2c 9d')).toBe(HandCategory.HighCard);
  });

  it('category ordering is strict', () => {
    const order = [
      'Ac Td 4h 3s Kd 2c 9d',
      '7c 7d 4h 3s Kd 2c 9d',
      '7c 7d 4h 4s Kd 2c 9d',
      '7c 7d 7h As Kd 2c 4d',
      '9c Td Jh Qs Kd 2c 2d',
      'Ah 9h 6h 3h 2h Kd Qc',
      'Kh Kd Ks 2c 2d 7h 8s',
      '9h 9d 9s 9c 2d 3c 4h',
      'As Ks Qs Js Ts 2c 3d',
    ].map(ev);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});

describe('ace-low straights', () => {
  it('wheel is a five-high straight', () => {
    const s = ev('Ac 2d 3h 4s 5c Kd Kh');
    expect(categoryOf(s)).toBe(HandCategory.Straight);
    expect(describeScore(s)).toBe('Straight, Five high');
  });
  it('six-high straight beats the wheel', () => {
    expect(ev('Ac 2d 3h 4s 5c 6d Kh')).toBeGreaterThan(ev('Ac 2d 3h 4s 5c Kd Kh'));
    expect(describeScore(ev('Ac 2d 3h 4s 5c 6d Kh'))).toBe('Straight, Six high');
  });
  it('steel wheel is a straight flush, below a six-high straight flush', () => {
    const wheel = ev('Ah 2h 3h 4h 5h Kd Qc');
    expect(categoryOf(wheel)).toBe(HandCategory.StraightFlush);
    expect(ev('6h 2h 3h 4h 5h Kd Qc')).toBeGreaterThan(wheel);
  });
  it('no wrap-around straights (Q-K-A-2-3)', () => {
    expect(cat('Qc Kd Ah 2s 3c 8d 9h')).toBe(HandCategory.HighCard);
  });
  it('ace-high straight is the broadway straight', () => {
    expect(describeScore(ev('Ac Kd Qh Js Tc 2d 3h'))).toBe('Straight, Ace high');
  });
});

describe('kickers and ties', () => {
  it('pair kickers decide', () => {
    expect(ev('Ac Ad Kh 7s 4c 3d 2h')).toBeGreaterThan(ev('Ac Ad Qh 7s 4c 3d 2h'));
  });
  it('only the best five cards count (sixth kicker irrelevant)', () => {
    // Board A A K Q J; hands 3-2 vs 4-2 both play the board's A A K Q J
    expect(ev('Ac Ad Kh Qs Jc 3d 2h')).toBe(ev('Ac Ad Kh Qs Jc 4d 2s'));
  });
  it('two pair: third pair ignored, best kicker used', () => {
    // KK QQ 22 + A : best is KK QQ A
    expect(ev('Kc Kd Qh Qs 2c 2d Ah')).toBe(ev('Kc Kd Qh Qs 3c 3d Ah'));
  });
  it('full house: two sets uses higher as trips', () => {
    expect(describeScore(ev('9c 9d 9h 5s 5c 5d 2h'))).toBe('Full house, Nines full of Fives');
  });
  it('flush compares all five cards', () => {
    expect(ev('Ah Kh 9h 6h 3h 2c 2d')).toBeGreaterThan(ev('Ah Kh 9h 6h 2h 3c 4d'));
  });
  it('flush of more than five suited cards uses best five', () => {
    expect(ev('Ah Kh 9h 6h 3h 2h 2d')).toBe(ev('Ah Kh 9h 6h 3h 4c 4d'));
  });
  it('quads kicker counts', () => {
    expect(ev('9h 9d 9s 9c Ad 3c 4h')).toBeGreaterThan(ev('9h 9d 9s 9c Kd 3c 4h'));
  });
  it('5-card and 7-card evaluation agree', () => {
    expect(categoryOf(ev('Ac Kc Qc Jc Tc'))).toBe(HandCategory.StraightFlush);
    expect(ev('2c 3d 4h 5s 7c')).toBeLessThan(ev('2c 3d 4h 5s 6c'));
  });
});

describe('category frequencies (sanity check on random 7-card hands)', () => {
  it('matches known probabilities within tolerance', () => {
    // Known 7-card frequencies: high card 17.4%, pair 43.8%, two pair 23.5%, trips 4.83%,
    // straight 4.62%, flush 3.03%, full house 2.60%, quads 0.168%, straight flush 0.0311%
    const rng = createRng(42);
    const counts = new Array(9).fill(0);
    const N = 200000;
    const deck = fullDeck();
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 7; k++) {
        const j = k + rng.int(52 - k);
        [deck[k], deck[j]] = [deck[j], deck[k]];
      }
      counts[categoryOf(evaluate(deck.slice(0, 7)))]++;
    }
    const f = counts.map((c) => c / N);
    expect(f[0]).toBeCloseTo(0.174, 2);
    expect(f[1]).toBeCloseTo(0.438, 2);
    expect(f[2]).toBeCloseTo(0.235, 2);
    expect(Math.abs(f[3] - 0.0483)).toBeLessThan(0.003);
    expect(Math.abs(f[4] - 0.0462)).toBeLessThan(0.003);
    expect(Math.abs(f[5] - 0.0303)).toBeLessThan(0.003);
    expect(Math.abs(f[6] - 0.026)).toBeLessThan(0.003);
  });
});
