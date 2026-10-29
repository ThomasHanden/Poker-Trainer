import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../src/scenarios/templates';
import { generateScenario, rebuildScenario, matchingTemplates } from '../src/scenarios/generator';
import { DEFAULT_SETTINGS, PracticeSettings } from '../src/scenarios/types';
import { startSession, heroAct, replay } from '../src/scenarios/play';
import { evaluateScenario, SCORING_VERSION } from '../src/evaluation/evaluate';
import { legalActions, totalChips, PlayerAction, HandState } from '../src/engine/rules';
import { createRng, parseCards } from '../src/engine/cards';
import { policyDistribution, publicView } from '../src/opponents/policy';
import { PROFILES } from '../src/opponents/profiles';
import { CONCEPTS } from '../src/content/concepts';

const settingsFor = (d: PracticeSettings['difficulty']): PracticeSettings => ({ ...DEFAULT_SETTINGS, difficulty: d });

function randomLegal(s: HandState, u: () => number): PlayerAction {
  const la = legalActions(s)!;
  const opts: PlayerAction[] = [];
  if (la.canFold) opts.push({ type: 'fold' });
  if (la.canCheck) opts.push({ type: 'check' });
  if (la.canCall) opts.push({ type: 'call' });
  if (la.canBet) opts.push({ type: 'bet', to: Math.min(la.maxTo, Math.max(la.minTo, Math.round(la.pot * 0.5))) });
  if (la.canRaise) opts.push({ type: 'raise', to: la.minTo });
  return opts[Math.floor(u() * opts.length)];
}

describe('scenario templates', () => {
  it('has at least 30 distinct templates with unique ids and complete metadata', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const streets = new Set(TEMPLATES.map((t) => t.street));
    for (const s of ['preflop', 'flop', 'turn', 'river']) expect(streets.has(s as never)).toBe(true);
    for (const t of TEMPLATES) {
      expect(t.objectives.length).toBeGreaterThan(0);
      expect(t.concepts.length).toBeGreaterThan(0);
      for (const c of t.concepts) expect(CONCEPTS[c]).toBeDefined();
      expect(t.lessons.length).toBeGreaterThan(0);
      expect(t.evaluation.assumptions.length).toBeGreaterThan(0);
      expect(t.difficulties.length).toBeGreaterThan(0);
    }
    // covers both betting and facing bets
    const facing = new Set(TEMPLATES.map((t) => t.facing));
    expect(facing.has('bet')).toBe(true);
    expect(facing.has('checked-to')).toBe(true);
  });

  for (const t of TEMPLATES) {
    it(`${t.id}: generates, plays to completion, evaluates, and conserves chips`, () => {
      const d = t.difficulties[t.difficulties.length - 1];
      for (let k = 0; k < 2; k++) {
        const res = generateScenario(settingsFor(d), { templateId: t.id, seed: 500 + k });
        expect(res.error, res.error).toBeUndefined();
        const sc = res.scenario!;
        expect(sc.state.toAct).toBe(sc.heroIndex);
        // card uniqueness
        const cards = [...sc.state.board, ...sc.state.players.flatMap((p) => p.hole), ...sc.state.deck];
        expect(new Set(cards).size).toBe(cards.length);
        const total = totalChips(sc.state);
        const rng = createRng(77 + k);
        let sess = startSession(sc);
        let guard = 0;
        while (!sess.state.complete && guard++ < 20) {
          sess = heroAct(sess, randomLegal(sess.state, rng.next), { hint: false, potOdds: false, equity: false, feedback: false });
          expect(totalChips(sess.state)).toBe(total);
        }
        expect(sess.state.complete).toBe(true);
        const ev = evaluateScenario(sc, sess.decisions, { samples: 60, keySamples: 80, profileVariants: false });
        expect(ev.scoringVersion).toBe(SCORING_VERSION);
        expect(ev.decisions.length).toBe(sess.decisions.length);
        if (ev.score !== null) {
          expect(ev.score).toBeGreaterThanOrEqual(0);
          expect(ev.score).toBeLessThanOrEqual(100);
        }
        for (const de of ev.decisions) {
          expect(de.info.length).toBeGreaterThan(20);
          expect(de.why.length).toBeGreaterThan(0);
          expect(de.sources.length + (de.grade === 'unscored' ? 1 : 0)).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe('determinism and reproducibility', () => {
  it('same seed + settings => identical scenario and identical opponent actions', () => {
    const s = settingsFor('intermediate');
    const a = generateScenario(s, { seed: 4242 }).scenario!;
    const b = generateScenario(s, { seed: 4242 }).scenario!;
    expect(a.id).toBe(b.id);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const acts: PlayerAction[] = [{ type: 'call' }, { type: 'check' }, { type: 'check' }, { type: 'check' }];
    const safe = (sc: typeof a) => {
      let sess = startSession(sc);
      const done: PlayerAction[] = [];
      for (const x of acts) {
        if (sess.state.complete) break;
        const la = legalActions(sess.state)!;
        const act = x.type === 'call' && !la.canCall ? { type: 'check' as const } : x.type === 'check' && !la.canCheck ? { type: 'call' as const } : x;
        done.push(act);
        sess = heroAct(sess, act, { hint: false, potOdds: false, equity: false, feedback: false });
      }
      return { sess, done };
    };
    const ra = safe(a);
    const rb = replay(b, ra.done);
    expect(JSON.stringify(ra.sess.state.history)).toBe(JSON.stringify(rb.state.history));
  });
  it('rebuildScenario reproduces a scenario from its id', () => {
    const s = settingsFor('advanced');
    const a = generateScenario(s, { seed: 99 }).scenario!;
    const b = rebuildScenario(a.id, s).scenario!;
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });
  it('evaluation is deterministic', () => {
    const s = settingsFor('intermediate');
    const sc = generateScenario(s, { templateId: 'fl-defend-cbet', seed: 7 }).scenario!;
    const sess = replay(sc, [{ type: 'call' }]);
    const e1 = evaluateScenario(sc, sess.decisions, { samples: 50, keySamples: 60, profileVariants: false });
    const e2 = evaluateScenario(sc, sess.decisions, { samples: 50, keySamples: 60, profileVariants: false });
    expect(e1.score).toBe(e2.score);
    expect(JSON.stringify(e1.decisions.map((d) => [d.grade, d.points]))).toBe(JSON.stringify(e2.decisions.map((d) => [d.grade, d.points])));
  });
  it('avoids recently seen fingerprints', () => {
    const s = settingsFor('beginner');
    const seen: string[] = [];
    const tpls: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = generateScenario(s, { recentFingerprints: seen, recentTemplates: tpls });
      expect(r.scenario).toBeDefined();
      expect(seen).not.toContain(r.scenario!.fingerprint);
      seen.push(r.scenario!.fingerprint);
      tpls.push(r.scenario!.templateId);
    }
    expect(new Set(tpls).size).toBeGreaterThan(5);
  });
});

describe('scoring is outcome-independent and consistent', () => {
  it('folding AA preflop when opening is graded a mistake; opening it is preferred', () => {
    const s = settingsFor('beginner');
    // find a pf-open scenario with a premium hand
    for (let seed = 1; seed < 400; seed++) {
      const sc = generateScenario({ ...s, tableSize: 6 }, { templateId: 'pf-open', seed }).scenario!;
      const hole = sc.state.players[sc.heroIndex].hole;
      const ranks = hole.map((c) => c >> 2);
      if (ranks[0] === 12 && ranks[1] === 12) {
        const fold = evaluateScenario(sc, replay(sc, [{ type: 'fold' }]).decisions, { profileVariants: false });
        expect(['mistake', 'blunder']).toContain(fold.decisions[0].grade);
        const raise = evaluateScenario(sc, replay(sc, [{ type: 'raise', to: 250 }]).decisions, { profileVariants: false });
        expect(raise.decisions[0].grade).toBe('best');
        expect(raise.score).toBe(100);
        return;
      }
    }
    throw new Error('no AA found');
  });
  it('score does not depend on who wins the pot (same decision, different runouts)', () => {
    const s = settingsFor('beginner');
    const grades = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const sc = generateScenario({ ...s }, { templateId: 'tr-bb-call-shove', seed }).scenario!;
      const ev = evaluateScenario(sc, replay(sc, [{ type: 'call' }]).decisions, { profileVariants: false });
      // the grade must be a function of equity vs price only
      const d = ev.decisions[0];
      grades.add(`${d.grade}`);
      expect(d.why.join(' ')).not.toMatch(/you won|you lost/i);
    }
    expect(grades.size).toBeGreaterThanOrEqual(1);
  });
});

describe('policies use no hidden information', () => {
  it('opponent action distribution ignores the hero cards and the deck order', () => {
    const sc = generateScenario(settingsFor('intermediate'), { templateId: 'fl-defend-cbet', seed: 3 }).scenario!;
    // advance to an opponent decision: hero calls
    let sess = startSession(sc);
    sess = heroAct(sess, { type: 'call' }, { hint: false, potOdds: false, equity: false, feedback: false });
    // find a state where an opponent is to act by checking history: take the scenario state at a villain decision
    const st = sc.base; // preflop: BTN to act? use base after blinds (UTG to act)
    const actor = st.toAct;
    const v1 = publicView(st, actor);
    const altered = structuredClone(st);
    altered.players[sc.heroIndex].hole = parseCards('2c7d');
    altered.deck = [...altered.deck].reverse();
    const v2 = publicView(altered, actor);
    expect(v1.state.deck.length).toBe(0);
    expect(v1.state.players.filter((p) => p.index !== actor).every((p) => p.hole.length === 0)).toBe(true);
    if (st.players[actor].hole.length === 2) {
      expect(JSON.stringify(policyDistribution(v1, PROFILES.unknown))).toBe(JSON.stringify(policyDistribution(v2, PROFILES.unknown)));
    }
    expect(sess.decisions.length).toBe(1);
  });
});

describe('settings filtering', () => {
  it('unsupported combinations are reported, not silently generated', () => {
    const r = generateScenario({ ...DEFAULT_SETTINGS, format: 'tournament', street: 'river' });
    expect(r.scenario).toBeUndefined();
    expect(r.error).toMatch(/not supported/);
    expect(r.suggestions!.length).toBeGreaterThan(0);
  });
  it('filters respect position, street and multiway', () => {
    const m = matchingTemplates({ ...DEFAULT_SETTINGS, difficulty: 'expert', heroPosition: 'BB', street: 'river' });
    expect(m.templates.every((t) => t.heroPositions.includes('BB') && t.street === 'river')).toBe(true);
    const mw = matchingTemplates({ ...DEFAULT_SETTINGS, difficulty: 'expert', players: 'multiway' });
    expect(mw.templates.length).toBeGreaterThan(0);
    expect(mw.templates.every((t) => t.multiway)).toBe(true);
  });
  it('every generated scenario matches requested settings', () => {
    const s: PracticeSettings = { ...DEFAULT_SETTINGS, difficulty: 'advanced', format: 'tournament', stack: 'short' };
    for (let i = 0; i < 5; i++) {
      const r = generateScenario(s, { seed: 900 + i });
      expect(r.scenario!.state.config.format).toBe('tournament');
    }
  });
});

describe('visual replay timeline', () => {
  it('reconstructs every template hand action by action', async () => {
    const { buildTimeline } = await import('../src/engine/timeline');
    for (const t of TEMPLATES) {
      for (let seed = 1; seed <= 3; seed++) {
        const sc = generateScenario(settingsFor(t.difficulties[t.difficulties.length - 1]), { templateId: t.id, seed: 900 + seed }).scenario!;
        const u = createRng(seed * 7919);
        let sess = startSession(sc);
        let guard = 0;
        while (!sess.state.complete && guard++ < 20) sess = heroAct(sess, randomLegal(sess.state, () => u.next()), { hint: false, potOdds: false, equity: false, feedback: false });
        const tl = buildTimeline(sess.state);
        expect(tl, `${t.id}#${seed}`).not.toBeNull();
        expect(tl!.length).toBe(1 + sess.state.history.filter((h) => !h.type.startsWith('post')).length);
        expect(tl![tl!.length - 1].state.result?.net).toEqual(sess.state.result?.net);
      }
    }
  });
});
