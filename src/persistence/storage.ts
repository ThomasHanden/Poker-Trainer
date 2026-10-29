// Local persistence (no account). Data is versioned; hand reviews are rebuilt deterministically
// from (scenario id, settings, hero actions), so only compact summaries are stored.

import type { PracticeSettings, Difficulty } from '../scenarios/types';
import { DEFAULT_SETTINGS } from '../scenarios/types';
import type { PlayerAction, Street, Format } from '../engine/rules';
import type { Grade, Assistance } from '../evaluation/evaluate';
import type { ConceptId } from '../content/concepts';

export const STORAGE_KEY = 'poker-trainer:data';
export const SCHEMA_VERSION = 1;
export const MAX_HISTORY = 3000;

export interface DecisionSummary {
  street: Street;
  actionLabel: string;
  grade: Grade;
  points: number | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  concepts: ConceptId[];
  mistakeCategories: string[];
  isKey: boolean;
  assisted: boolean;
  sizing?: 'preferred' | 'acceptable' | 'off';
}

export interface HandRecord {
  id: string;
  scenarioId: string;
  templateId: string;
  templateVersion: number;
  scoringVersion: string;
  title: string;
  settings: PracticeSettings;
  difficulty: Difficulty;
  mode: 'guided' | 'assessment';
  format: Format;
  heroPosition: string;
  keyStreet: Street;
  createdAt: number;
  heroActions: PlayerAction[];
  assists: Assistance[];
  score: number | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  assisted: boolean;
  decisions: DecisionSummary[];
  netBB: number;
  bookmarked: boolean;
  note?: string;
}

export interface SavedRange {
  id: string;
  name: string;
  text: string; // documented range format
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LessonProgress {
  completed: boolean;
  quizBest?: { correct: number; total: number; at: number };
  visitedAt?: number;
}

export interface AppData {
  schemaVersion: number;
  settings: PracticeSettings;
  history: HandRecord[];
  lessons: Record<string, LessonProgress>;
  ranges: SavedRange[];
  recent: { fingerprints: string[]; templates: string[] };
  prefs: { fourColor: boolean; showShortcuts: boolean };
}

export function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: DEFAULT_SETTINGS,
    history: [],
    lessons: {},
    ranges: [],
    recent: { fingerprints: [], templates: [] },
    prefs: { fourColor: false, showShortcuts: true },
  };
}

/** Storage backend (injectable for tests). */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultKV(): KV | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const t = '__pt_test__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();
const memoryKV: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

let kv: KV = defaultKV() ?? memoryKV;
export const persistentStorageAvailable = () => kv !== memoryKV;
export function setKV(x: KV) {
  kv = x;
}

/** Migrate older shapes to the current schema; unknown fields are dropped safely. */
export function migrate(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  const v = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error(`This data was saved by a newer version of the app (schema ${v}).`);
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}), assists: { ...DEFAULT_SETTINGS.assists, ...(r.settings?.assists ?? {}) } },
    history: Array.isArray(r.history) ? r.history.filter(validHand).slice(-MAX_HISTORY) : [],
    lessons: r.lessons && typeof r.lessons === 'object' ? r.lessons : {},
    ranges: Array.isArray(r.ranges) ? r.ranges.filter((x) => x && typeof x.text === 'string' && typeof x.name === 'string') : [],
    recent: {
      fingerprints: Array.isArray(r.recent?.fingerprints) ? r.recent!.fingerprints.slice(-50) : [],
      templates: Array.isArray(r.recent?.templates) ? r.recent!.templates.slice(-20) : [],
    },
    prefs: { ...base.prefs, ...(r.prefs ?? {}) },
  };
}

function validHand(h: unknown): h is HandRecord {
  if (!h || typeof h !== 'object') return false;
  const x = h as HandRecord;
  return typeof x.id === 'string' && typeof x.scenarioId === 'string' && Array.isArray(x.heroActions) && Array.isArray(x.decisions);
}

export function load(): AppData {
  try {
    const s = kv.getItem(STORAGE_KEY);
    if (!s) return emptyData();
    return migrate(JSON.parse(s));
  } catch (e) {
    console.warn('Could not load saved data', e);
    return emptyData();
  }
}

export function save(d: AppData): { ok: boolean; error?: string } {
  try {
    kv.setItem(STORAGE_KEY, JSON.stringify(d));
    return { ok: true };
  } catch (e) {
    // quota: drop oldest history and retry once
    try {
      const trimmed = { ...d, history: d.history.slice(-Math.floor(d.history.length / 2)) };
      kv.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return { ok: true, error: 'Storage was full; the oldest half of your hand history was removed.' };
    } catch {
      return { ok: false, error: (e as Error).message };
    }
  }
}

export function exportData(d: AppData): string {
  return JSON.stringify({ app: 'poker-trainer', exportedAt: new Date().toISOString(), ...d }, null, 2);
}

export function importData(text: string, current: AppData, mode: 'replace' | 'merge'): AppData {
  const parsed = JSON.parse(text);
  if (parsed.app && parsed.app !== 'poker-trainer') throw new Error('This file is not a Poker Trainer export.');
  const incoming = migrate(parsed);
  if (mode === 'replace') return incoming;
  const ids = new Set(current.history.map((h) => h.id));
  const rIds = new Set(current.ranges.map((r) => r.id));
  const lessons = { ...current.lessons };
  for (const [k, v] of Object.entries(incoming.lessons)) {
    const c = lessons[k];
    lessons[k] = { completed: (c?.completed ?? false) || v.completed, quizBest: bestQuiz(c?.quizBest, v.quizBest), visitedAt: Math.max(c?.visitedAt ?? 0, v.visitedAt ?? 0) || undefined };
  }
  return {
    ...current,
    history: [...current.history, ...incoming.history.filter((h) => !ids.has(h.id))].sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_HISTORY),
    ranges: [...current.ranges, ...incoming.ranges.filter((r) => !rIds.has(r.id))],
    lessons,
  };
}

function bestQuiz(a?: LessonProgress['quizBest'], b?: LessonProgress['quizBest']) {
  if (!a) return b;
  if (!b) return a;
  return b.correct / b.total > a.correct / a.total ? b : a;
}

export function reset(): AppData {
  try {
    kv.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return emptyData();
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
