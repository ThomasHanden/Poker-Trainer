import { describe, it, expect, beforeEach } from 'vitest';
import { setKV, load, save, emptyData, exportData, importData, migrate, reset, STORAGE_KEY, HandRecord, KV } from '../src/persistence/storage';
import { generateScenario, rebuildScenario } from '../src/scenarios/generator';
import { DEFAULT_SETTINGS } from '../src/scenarios/types';
import { replay } from '../src/scenarios/play';
import { evaluateScenario } from '../src/evaluation/evaluate';

function memKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const hand = (id: string, extra: Partial<HandRecord> = {}): HandRecord => ({
  id,
  scenarioId: 'pf-open@1#5',
  templateId: 'pf-open',
  templateVersion: 1,
  scoringVersion: '1.0.0',
  title: 't',
  settings: DEFAULT_SETTINGS,
  difficulty: 'beginner',
  mode: 'assessment',
  format: 'cash',
  heroPosition: 'BTN',
  keyStreet: 'preflop',
  createdAt: Date.now(),
  heroActions: [{ type: 'fold' }],
  assists: [{ hint: false, potOdds: false, equity: false, feedback: false }],
  score: 85,
  confidence: 'medium',
  assisted: false,
  decisions: [],
  netBB: 0,
  bookmarked: false,
  ...extra,
});

describe('persistence', () => {
  let kv: ReturnType<typeof memKV>;
  beforeEach(() => {
    kv = memKV();
    setKV(kv);
  });
  it('round-trips saved data', () => {
    const d = { ...emptyData(), history: [hand('a')], ranges: [{ id: 'r', name: 'mine', text: 'AA,KK', createdAt: 1, updatedAt: 1 }] };
    d.lessons['pot-odds'] = { completed: true };
    expect(save(d).ok).toBe(true);
    const back = load();
    expect(back.history[0].id).toBe('a');
    expect(back.ranges[0].text).toBe('AA,KK');
    expect(back.lessons['pot-odds'].completed).toBe(true);
  });
  it('survives corrupt storage', () => {
    kv.setItem(STORAGE_KEY, '{not json');
    expect(load().history).toEqual([]);
  });
  it('migrates partial/old data and drops invalid entries', () => {
    const m = migrate({ schemaVersion: 0, history: [hand('ok'), { bad: true }], settings: { difficulty: 'expert' } });
    expect(m.history.length).toBe(1);
    expect(m.settings.difficulty).toBe('expert');
    expect(m.settings.assists).toBeDefined();
    expect(() => migrate({ schemaVersion: 999 })).toThrow();
  });
  it('export → import (replace and merge)', () => {
    const a = { ...emptyData(), history: [hand('1'), hand('2')] };
    const text = exportData(a);
    const replaced = importData(text, emptyData(), 'replace');
    expect(replaced.history.map((h) => h.id)).toEqual(['1', '2']);
    const merged = importData(text, { ...emptyData(), history: [hand('2'), hand('3')] }, 'merge');
    expect(merged.history.map((h) => h.id).sort()).toEqual(['1', '2', '3']);
    expect(() => importData(JSON.stringify({ app: 'other' }), emptyData(), 'merge')).toThrow();
  });
  it('reset clears storage', () => {
    save({ ...emptyData(), history: [hand('x')] });
    reset();
    expect(kv.map.has(STORAGE_KEY)).toBe(false);
    expect(load().history.length).toBe(0);
  });
  it('a stored hand rebuilds to the identical review (restoration)', () => {
    const s = { ...DEFAULT_SETTINGS, difficulty: 'intermediate' as const };
    const sc = generateScenario(s, { templateId: 'rv-bluff-catch', seed: 31 }).scenario!;
    const sess = replay(sc, [{ type: 'call' }]);
    const ev1 = evaluateScenario(sc, sess.decisions, { profileVariants: false });
    // persist minimal info, reload, rebuild
    save({ ...emptyData(), history: [hand('h', { scenarioId: sc.id, settings: s, heroActions: sess.decisions.map((d) => d.action), score: ev1.score })] });
    const rec = load().history[0];
    const sc2 = rebuildScenario(rec.scenarioId, rec.settings).scenario!;
    const ev2 = evaluateScenario(sc2, replay(sc2, rec.heroActions).decisions, { profileVariants: false });
    expect(ev2.score).toBe(rec.score);
    expect(JSON.stringify(replay(sc2, rec.heroActions).state.history)).toBe(JSON.stringify(sess.state.history));
  });
});
