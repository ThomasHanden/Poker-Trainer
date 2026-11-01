// The first visit: the home page's "Where would you like to start?", Help me (guided) as the
// default for new players only, and single spots ending after their key decision.
import { describe, it, expect } from 'vitest';
import { loadStartChoice, saveStartChoice, shouldAskStart } from '../src/ui/startChoice';
import { progressKnown } from '../src/persistence/accountSync';
import { DEFAULT_SETTINGS, MODE_LABEL } from '../src/scenarios/types';
import { emptyData, migrate } from '../src/persistence/storage';
import { generateScenario } from '../src/scenarios/generator';
import { heroAct, isFullHand, spotOver, startSession } from '../src/scenarios/play';
import { legalActions } from '../src/engine/rules';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const none = { hands: 0, lessons: 0, puzzles: 0 };

describe('where would you like to start?', () => {
  it('is asked of someone new, and not again once answered or skipped (after a refresh too)', () => {
    const s = store();
    expect(loadStartChoice(s)).toBeNull();
    expect(shouldAskStart(loadStartChoice(s), none)).toBe(true);
    saveStartChoice('skip', s);
    // a refresh reads it back from storage
    expect(loadStartChoice(s)).toBe('skip');
    expect(shouldAskStart(loadStartChoice(s), none)).toBe(false);
    for (const c of ['new', 'rules', 'game'] as const) {
      const t = store();
      saveStartChoice(c, t);
      expect(loadStartChoice(t)).toBe(c);
    }
  });

  it('is never asked of anyone who has already played, read or solved something', () => {
    expect(shouldAskStart(null, { hands: 1, lessons: 0, puzzles: 0 })).toBe(false);
    expect(shouldAskStart(null, { hands: 0, lessons: 1, puzzles: 0 })).toBe(false);
    expect(shouldAskStart(null, { hands: 0, lessons: 0, puzzles: 1 })).toBe(false);
  });

  it('ignores anything else stored under its key, and without storage asks only once per visit', () => {
    const s = store();
    s.setItem('felt-school:start-choice', 'bogus');
    expect(loadStartChoice(s)).not.toBe('bogus');
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveStartChoice('new', broken)).not.toThrow();
    expect(loadStartChoice(broken)).toBe('new'); // remembered for this visit
  });
});

describe('nothing is suggested from progress that is still loading', () => {
  it('a guest’s is known at once; a signed-in account’s only once it has loaded (or could not be)', () => {
    expect(progressKnown('off', null, null)).toBe(true);
    expect(progressKnown('signed-out', null, null)).toBe(true);
    expect(progressKnown('loading', null, null)).toBe(false); // sign-in still being checked
    expect(progressKnown('signed-in', 'u1', null)).toBe(false); // the account's sync has not started
    expect(progressKnown('signed-in', 'u1', { phase: 'loading' })).toBe(false);
    expect(progressKnown('signed-in', 'u1', { phase: 'ready', saving: false })).toBe(true);
    expect(progressKnown('signed-in', 'u1', { phase: 'load-failed', message: 'x' })).toBe(true); // this device's copy is shown
  });
});

describe('practice modes', () => {
  it('new players start in Help me (guided); the stored names stay guided/assessment', () => {
    expect(DEFAULT_SETTINGS.mode).toBe('guided');
    expect(DEFAULT_SETTINGS.difficulty).toBe('beginner');
    expect(emptyData().settings.mode).toBe('guided');
    expect(MODE_LABEL).toEqual({ guided: 'Help me', assessment: 'Test me' });
  });

  it('settings someone saved keep their mode, Test me included', () => {
    const saved = migrate({ schemaVersion: 1, settings: { ...DEFAULT_SETTINGS, mode: 'assessment', difficulty: 'advanced' } });
    expect(saved.settings.mode).toBe('assessment');
    expect(saved.settings.difficulty).toBe('advanced');
    // older saves without a mode get the default
    const { mode: _m, ...noMode } = DEFAULT_SETTINGS;
    expect(migrate({ schemaVersion: 1, settings: noMode }).settings.mode).toBe('guided');
  });
});

describe('single spots end after the key decision; full hands go on', () => {
  const passive = (s: ReturnType<typeof startSession>) => {
    const la = legalActions(s.state)!;
    return la.canCheck ? ({ type: 'check' } as const) : ({ type: 'call' } as const);
  };
  const NO_HELP = { hint: false, potOdds: false, equity: false, feedback: false };

  it('a spot is over once you have acted and the others have replied', () => {
    let checked = 0;
    for (let seed = 1; seed < 40; seed++) {
      const r = generateScenario({ ...DEFAULT_SETTINGS, street: 'flop' }, { seed: seed * 7919 });
      if (!r.scenario) continue;
      const s = startSession(r.scenario);
      expect(isFullHand(r.scenario)).toBe(false);
      expect(spotOver(s)).toBe(s.state.complete);
      if (s.state.complete) continue;
      const after = heroAct(s, passive(s), NO_HELP);
      expect(spotOver(after)).toBe(true);
      // the others have replied: it is your turn again, or the hand is over
      expect(after.state.complete || after.state.toAct === r.scenario.heroIndex).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('a full hand is over only when the hand is', () => {
    let played = 0;
    for (let seed = 1; seed < 20; seed++) {
      const r = generateScenario({ ...DEFAULT_SETTINGS, street: 'full' }, { seed: seed * 104729 });
      if (!r.scenario) continue;
      expect(isFullHand(r.scenario)).toBe(true);
      let s = startSession(r.scenario);
      let decisions = 0;
      while (!s.state.complete && decisions < 20) {
        expect(spotOver(s)).toBe(false);
        s = heroAct(s, passive(s), NO_HELP);
        decisions++;
      }
      expect(spotOver(s)).toBe(true);
      played++;
    }
    expect(played).toBeGreaterThan(5);
  });
});
