import { describe, it, expect } from 'vitest';
import { generateScenario, rebuildScenario } from '../src/scenarios/generator';
import { DEFAULT_SETTINGS, PracticeSettings } from '../src/scenarios/types';
import { startSession, heroAct } from '../src/scenarios/play';
import { evaluateScenario } from '../src/evaluation/evaluate';
import { legalActions, totalChips } from '../src/engine/rules';

const settings: PracticeSettings = { ...DEFAULT_SETTINGS, street: 'full' };

describe('full hands', () => {
  it('only full hands are dealt in full-hand mode, starting preflop with every seat holding cards', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const res = generateScenario(settings, { seed: 1000 + seed });
      expect(res.error, res.error).toBeUndefined();
      const sc = res.scenario!;
      expect(sc.templateId).toBe('full-hand');
      expect(sc.state.street).toBe('preflop');
      expect(sc.state.toAct).toBe(sc.heroIndex);
      for (const p of sc.state.players) expect(p.hole.length).toBe(2);
      const cards = [...sc.state.players.flatMap((p) => p.hole), ...sc.state.deck];
      expect(new Set(cards).size).toBe(52);
    }
  });

  it('plays to the end across several streets, conserves chips, rebuilds exactly and evaluates every decision', () => {
    let multiStreet = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sc = generateScenario(settings, { seed: 2000 + seed }).scenario!;
      const total = totalChips(sc.state);
      let sess = startSession(sc);
      let guard = 0;
      // call/check down so the hand reaches later streets
      while (!sess.state.complete && guard++ < 20) {
        const la = legalActions(sess.state)!;
        sess = heroAct(sess, la.canCheck ? { type: 'check' } : { type: 'call' }, { hint: false, potOdds: false, equity: false, feedback: false });
      }
      expect(sess.state.complete).toBe(true);
      expect(totalChips(sess.state)).toBe(total);
      if (new Set(sess.decisions.map((d) => d.street)).size > 1) multiStreet++;
      const rb = rebuildScenario(sc.id, sc.settings).scenario!;
      expect(rb.state.players.map((p) => p.hole)).toEqual(sc.state.players.map((p) => p.hole));
      if (seed <= 3) {
        const ev = evaluateScenario(sc, sess.decisions, { samples: 60, keySamples: 60, profileVariants: false });
        expect(ev.decisions.length).toBe(sess.decisions.length);
      }
    }
    expect(multiStreet).toBeGreaterThan(3);
  });
});
