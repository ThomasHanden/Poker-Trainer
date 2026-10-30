// Regression tests for issues found in the site audit: pot odds when you cannot cover a bet,
// antes as dead money, the opponent model's checking ranges, river wording, and lesson text that
// quotes the app's own charts.
import { describe, it, expect } from 'vitest';
import { parseCards, deckWithout } from '../src/engine/cards';
import { newHand, applyAction, potSize, winnablePot, legalActions, TableConfig } from '../src/engine/rules';
import { generateScenario } from '../src/scenarios/generator';
import { DEFAULT_SETTINGS } from '../src/scenarios/types';
import { buildDecisionContext, rangeBreakdown } from '../src/evaluation/analysis';
import { startSession, heroAct } from '../src/scenarios/play';
import { evaluateScenario } from '../src/evaluation/evaluate';
import { TEMPLATES } from '../src/scenarios/templates';
import { LESSONS, LESSON_INDEX } from '../src/content/lessons';
import { getChart } from '../src/ranges/presets';

const huAnte: TableConfig = { format: 'tournament', numPlayers: 2, sb: 50, bb: 100, ante: 100, anteType: 'bb' };

function huHand(holes: [string, string], board: string) {
  const h = holes.map((x) => parseCards(x));
  const b = parseCards(board);
  return newHand({ config: huAnte, stacks: [1000, 1000], heroIndex: 0, holes: h, deckOrder: [...b, ...deckWithout([...h.flat(), ...b])] });
}

describe('antes are dead money', () => {
  it('an all-in big blind cannot win more of a shove than its blind plus call', () => {
    const s0 = huHand(['7c2d', 'AsAd'], 'Kh9s5c3d2h');
    const sb = s0.players.findIndex((p) => p.position !== 'BB');
    const bb = 1 - sb;
    // SB shoves 10bb; the BB has 10bb but 1bb went in as the ante, so it can call only 8bb more
    const shove = applyAction(s0, { type: 'raise', to: 1000 });
    expect(legalActions(shove)!.toCall).toBe(800);
    // winnable: SB's chips up to the BB's 9bb live level, the BB's own 1bb blind and the 1bb ante
    expect(potSize(shove)).toBe(1200);
    expect(winnablePot(shove, bb, 800)).toBe(1100);
    const end = applyAction(shove, { type: 'call' });
    expect(end.complete).toBe(true);
    // AA wins the 19bb main pot; the SB's unmatched 1bb comes back
    expect(end.players[bb].stack).toBe(1900);
    expect(end.players[sb].stack).toBe(100);
  });

  it('winnable pot equals the whole pot when you cover the bet', () => {
    const s0 = huHand(['7c2d', 'AsAd'], 'Kh9s5c3d2h');
    const bb = s0.players.findIndex((p) => p.position === 'BB');
    const open = applyAction(s0, { type: 'raise', to: 250 });
    expect(winnablePot(open, bb, legalActions(open)!.toCall)).toBe(potSize(open));
  });
});

describe('pot odds when facing a bigger stack’s shove', () => {
  for (const id of ['tr-bb-call-shove', 'tr-bubble-call']) {
    it(`${id}: the price only counts chips you can win`, () => {
      for (const seed of [31, 32, 33]) {
        const g = generateScenario({ ...DEFAULT_SETTINGS }, { templateId: id, seed });
        const sc = g.scenario!;
        const ctx = buildDecisionContext(sc, sc.state, true, { equitySamples: 1 });
        // calling all-in for X into a matched pot: you risk X to win at most X plus the dead money
        expect(ctx.requiredEquity, `${id} seed ${seed}`).toBeGreaterThan(0.33);
        expect(ctx.requiredEquity).toBeLessThan(0.5);
      }
    });
  }
});

describe('opponent model', () => {
  it('the caller checks most strong hands to the preflop raiser instead of leading', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = generateScenario({ ...DEFAULT_SETTINGS }, { templateId: 'fl-cbet-dry-ip', seed });
      const sc = g.scenario!;
      const ctx = buildDecisionContext(sc, sc.state, true, { equitySamples: 1 });
      const b = rangeBreakdown(ctx.villains[0].combos, ctx.board);
      const topPlus = b.filter((x) => x.key === 'strong' || x.key === 'top').reduce((a, x) => a + x.share, 0);
      expect(topPlus, `seed ${seed}`).toBeGreaterThan(0.1);
    }
  });
});

describe('river explanations', () => {
  it('never refer to later streets or draws on the river', () => {
    for (const t of TEMPLATES.filter((x) => x.street === 'river')) {
      const g = generateScenario({ ...DEFAULT_SETTINGS, difficulty: t.difficulties[0] }, { templateId: t.id, seed: 7 });
      const sc = g.scenario!;
      let sess = startSession(sc);
      for (let k = 0; k < 4 && !sess.state.complete; k++) {
        const la = legalActions(sess.state)!;
        sess = heroAct(sess, la.canCheck ? { type: 'check' } : { type: 'call' }, { hint: false, potOdds: false, equity: false, feedback: false });
      }
      const ev = evaluateScenario(sc, sess.decisions, { samples: 60, keySamples: 60, profileVariants: false });
      for (const d of ev.decisions.filter((x) => x.street === 'river')) for (const w of d.why) expect(w, t.id).not.toMatch(/later streets|denies equity to draws/);
    }
  });
});

describe('lesson text that quotes the app’s charts', () => {
  it('matches the charts', () => {
    const bbBtn = getChart('cash6-BB-vs-BTN')!;
    expect(bbBtn.raise['A3s']).toBeCloseTo(0.7, 6);
    expect(bbBtn.call['A3s']).toBeCloseTo(0.3, 6);
    expect(LESSON_INDEX['mixed-strategies'].example.steps.join(' ')).toMatch(/A3s 70% .* calls it 30%/);

    const bbUtg = getChart('cash6-BB-vs-UTG')!;
    for (const h of ['A9o', 'K9o', 'Q9o']) expect(bbUtg.raise[h] + bbUtg.call[h], h).toBe(0);
    expect(bbUtg.call['QTo']).toBeGreaterThan(0);
    expect(bbUtg.call['QTo']).toBeLessThan(0.5);
    expect(bbUtg.call['75s'] + bbUtg.raise['75s']).toBe(1);
    expect(LESSON_INDEX['blind-defense'].example.steps.join(' ')).toMatch(/A9o, K9o and Q9o always, QTo more often than not/);

    const utg = getChart('cash6-open-UTG')!;
    expect(utg.raise['KJo']).toBe(1);
    expect(utg.raise['A9o']).toBe(0);
    const btnCo = getChart('cash6-BTN-vs-CO')!;
    expect(btnCo.call['87s']).toBeGreaterThan(btnCo.raise['87s']);
    expect(btnCo.raise['87s']).toBeGreaterThan(0);
    expect(getChart('pf-sb-shove-8')!.raise['K7o']).toBe(1);
    expect(getChart('pf-bb-call-8')!.call['K7o']).toBe(1);
  });
});

describe('lesson quizzes', () => {
  it('do not ask the same question twice in one lesson', () => {
    const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9%♠♥♦♣ ]/g, ' ').split(/\s+/).filter(Boolean));
    const jac = (a: Set<string>, b: Set<string>) => {
      let i = 0;
      for (const x of a) if (b.has(x)) i++;
      return i / (a.size + b.size - i);
    };
    for (const l of LESSONS)
      for (let i = 0; i < l.quiz.length; i++)
        for (let j = i + 1; j < l.quiz.length; j++) {
          const a = l.quiz[i];
          const b = l.quiz[j];
          expect(a.q, l.id).not.toBe(b.q);
          const sameAnswer = a.options[a.answer].toLowerCase() === b.options[b.answer].toLowerCase();
          expect(sameAnswer && jac(words(a.q), words(b.q)) >= 0.6, `${l.id}: “${a.q}” / “${b.q}”`).toBe(false);
        }
  });
});
