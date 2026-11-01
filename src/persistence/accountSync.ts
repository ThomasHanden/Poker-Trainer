// Keeping a signed-in player's progress in their account (Supabase; see
// supabase/migrations). The browser keeps a copy per account (storage.ts: ownedKey) and remembers
// what it last synced (the "base"), so it can tell its own changes from the account's:
//
// - the progress document (settings, display preferences, lessons, saved ranges) is saved only on
//   top of the revision this browser last saw; if another device saved since, this browser's own
//   changes are merged into the newer copy and saved again, so nothing is silently overwritten;
// - practice hands and puzzle results are rows keyed by their own ids, so saving one twice (a
//   retry, another device, an import) never makes a second copy.

import type { PracticeSettings } from '../scenarios/types';
import type { PuzzleRun } from '../puzzles/daily';
import { MAX_HISTORY, bestQuiz, emptyData, migrate, ownedKey, type AppData, type HandRecord, type LessonProgress, type SavedRange } from './storage';

/** What the account's progress document holds; anything missing has not been saved yet. */
export interface AccountDoc {
  settings?: PracticeSettings;
  prefs?: AppData['prefs'];
  lessons?: Record<string, LessonProgress>;
  ranges?: SavedRange[];
}

export interface RemoteHand {
  record: HandRecord;
  updatedAt: number;
}

/** The account as the server has it (the newest hands and puzzle results only). */
export interface Remote {
  revision: number;
  doc: AccountDoc;
  hands: RemoteHand[];
  runs: PuzzleRun[];
}

/** What this browser last saved to (or loaded from) the account. */
export interface SyncBase {
  revision: number;
  doc: AccountDoc;
  /** hand id → handSig of the copy the account has */
  hands: Record<string, string>;
  runs: string[];
}

/** The parts of a hand a player can change after it is played. */
export const handSig = (h: HandRecord) => JSON.stringify([!!h.bookmarked, h.note ?? null]);

/** JSON with object keys sorted, so two copies of the same data compare equal (the database reorders keys). */
export function stable(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

export function docOf(d: AppData): AccountDoc {
  return { settings: d.settings, prefs: d.prefs, lessons: d.lessons, ranges: d.ranges };
}

/** Put a document's contents into the app's data, through the same checks as anything loaded. */
export function applyDoc(d: AppData, doc: AccountDoc): AppData {
  return migrate({ ...d, settings: doc.settings ?? d.settings, prefs: doc.prefs ?? d.prefs, lessons: doc.lessons ?? d.lessons, ranges: doc.ranges ?? d.ranges });
}

/** Lesson progress only goes forward: completed stays completed, the best quiz and latest visit win. */
export function mergeLessons(a: Record<string, LessonProgress> = {}, b: Record<string, LessonProgress> = {}): Record<string, LessonProgress> {
  const out: Record<string, LessonProgress> = { ...a };
  for (const [id, y] of Object.entries(b)) {
    const x = out[id];
    if (!x) {
      out[id] = y;
      continue;
    }
    const visitedAt = Math.max(x.visitedAt ?? 0, y.visitedAt ?? 0) || undefined;
    const quizBest = bestQuiz(x.quizBest, y.quizBest);
    out[id] = { completed: !!(x.completed || y.completed), ...(quizBest ? { quizBest } : {}), ...(visitedAt ? { visitedAt } : {}) };
  }
  return out;
}

/** Ranges: the account's copy, with this browser's own additions, edits and deletions applied. */
export function mergeRanges(base: SavedRange[] = [], local: SavedRange[] = [], remote: SavedRange[] = []): SavedRange[] {
  const b = new Map(base.map((r) => [r.id, r]));
  const l = new Map(local.map((r) => [r.id, r]));
  const out = new Map(remote.map((r) => [r.id, r]));
  for (const [id, r] of l) if (!b.has(id) || !same(b.get(id), r)) out.set(id, r);
  for (const id of b.keys()) if (!l.has(id)) out.delete(id);
  return [...out.values()];
}

/** Three-way merge of the progress document: changes made here win over the account's copy; the rest comes from the account. */
export function mergeDoc(base: AccountDoc, local: AccountDoc, remote: AccountDoc): AccountDoc {
  return {
    settings: !same(local.settings, base.settings) ? local.settings : (remote.settings ?? local.settings),
    prefs: !same(local.prefs, base.prefs) ? local.prefs : (remote.prefs ?? local.prefs),
    lessons: mergeLessons(remote.lessons, local.lessons),
    ranges: mergeRanges(base.ranges, local.ranges, remote.ranges),
  };
}

/** What this browser has that the account does not: the document if it changed, new or changed hands, new puzzle results. */
export function pendingChanges(local: AppData, runs: PuzzleRun[], base: SyncBase, now = Date.now()) {
  const doc = docOf(local);
  return {
    doc: same(doc, base.doc) ? null : doc,
    // a new hand carries its creation time, so an older copy never beats an edit made elsewhere
    hands: local.history.filter((h) => base.hands[h.id] !== handSig(h)).map((h) => ({ record: h, updatedAt: base.hands[h.id] === undefined ? h.createdAt : now })),
    runs: runs.filter((r) => !base.runs.includes(r.id)),
  };
}

/** The base for a browser that has never synced this account: everything it holds counts as already in the account, so a fresh copy never overwrites the account. */
export function freshBase(local: AppData, runs: PuzzleRun[]): SyncBase {
  return { revision: -1, doc: docOf(local), hands: Object.fromEntries(local.history.map((h) => [h.id, handSig(h)])), runs: runs.map((r) => r.id) };
}

/**
 * Bring the account's copy into this browser, keeping this browser's own unsaved changes on top.
 * Returns the merged data and the new base (what the account has now).
 */
export function applyRemote(local: AppData, localRuns: PuzzleRun[], base: SyncBase, remote: Remote): { data: AppData; runs: PuzzleRun[]; base: SyncBase } {
  const doc = mergeDoc(base.doc, docOf(local), remote.doc);
  const hands = new Map(remote.hands.map((x) => [x.record.id, x.record]));
  for (const h of local.history) {
    const synced = base.hands[h.id];
    if (synced === undefined ? !hands.has(h.id) : synced !== handSig(h)) hands.set(h.id, h); // new here, or changed here
  }
  const history = [...hands.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_HISTORY);
  const runs = new Map(remote.runs.map((r) => [r.id, r]));
  for (const r of localRuns) if (!base.runs.includes(r.id) && !runs.has(r.id)) runs.set(r.id, r);
  return {
    data: applyDoc({ ...local, history }, doc),
    runs: [...runs.values()].sort((a, b) => a.at - b.at),
    base: { revision: remote.revision, doc: remote.doc, hands: Object.fromEntries(remote.hands.map((x) => [x.record.id, handSig(x.record)])), runs: remote.runs.map((r) => r.id) },
  };
}

// ------------------------------------------------------------------------------------------
// Guest progress: what was saved in this browser before signing in
// ------------------------------------------------------------------------------------------

export interface GuestSummary {
  hands: number;
  lessons: number;
  ranges: number;
  puzzles: number;
  /** practice settings or display preferences differ from the defaults */
  settings: boolean;
}

export function guestSummary(guest: AppData, runs: PuzzleRun[]): GuestSummary {
  const blank = emptyData();
  return {
    hands: guest.history.length,
    lessons: Object.values(guest.lessons).filter((l) => l.completed || l.quizBest).length,
    ranges: guest.ranges.length,
    puzzles: runs.length,
    settings: !same(guest.settings, blank.settings) || !same(guest.prefs, blank.prefs),
  };
}

export const hasGuestProgress = (s: GuestSummary) => s.hands + s.lessons + s.ranges + s.puzzles > 0 || s.settings;

/**
 * Guest progress merged into an account. Hands, ranges and puzzle results are matched by id, so
 * importing twice adds nothing; lessons only move forward; settings come from the guest only if
 * the account has never saved any.
 */
export function mergeGuest(account: AppData, accountRuns: PuzzleRun[], guest: AppData, guestRuns: PuzzleRun[], accountHasSettings: boolean): { data: AppData; runs: PuzzleRun[] } {
  const ids = new Set(account.history.map((h) => h.id));
  const rangeIds = new Set(account.ranges.map((r) => r.id));
  const runIds = new Set(accountRuns.map((r) => r.id));
  return {
    data: migrate({
      ...account,
      history: [...account.history, ...guest.history.filter((h) => !ids.has(h.id))].sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_HISTORY),
      lessons: mergeLessons(account.lessons, guest.lessons),
      ranges: [...account.ranges, ...guest.ranges.filter((r) => !rangeIds.has(r.id))],
      settings: accountHasSettings ? account.settings : guest.settings,
      prefs: accountHasSettings ? account.prefs : guest.prefs,
    }),
    runs: [...accountRuns, ...guestRuns.filter((r) => !runIds.has(r.id))].sort((a, b) => a.at - b.at),
  };
}

// ------------------------------------------------------------------------------------------
// Talking to the account
// ------------------------------------------------------------------------------------------

/** The account storage the sync uses (Supabase in the app, a stand-in in tests). */
export interface AccountStore {
  fetch(): Promise<Remote>;
  saveDoc(expected: number, doc: AccountDoc): Promise<{ saved: true; revision: number } | { saved: false; revision: number; doc: AccountDoc }>;
  saveHands(hands: RemoteHand[]): Promise<void>;
  saveRuns(runs: PuzzleRun[]): Promise<void>;
  reset(): Promise<void>;
}

export type SyncState =
  | { phase: 'loading' }
  | { phase: 'ready'; saving: boolean }
  /** the account could not be loaded: nothing is saved to it until it is */
  | { phase: 'load-failed'; message: string }
  /** loaded, but the latest changes are not saved yet (kept here and retried) */
  | { phase: 'save-failed'; message: string };

/**
 * Whether the progress on screen is really the player's, so suggestions can be made from it: a
 * guest's straight away; a signed-in account's once it has loaded (or failed to, when this device's
 * copy is what there is). While sign-in or the account's progress is still on its way: not yet.
 */
export function progressKnown(auth: 'off' | 'loading' | 'signed-out' | 'signed-in', owner: string | null, sync: SyncState | null): boolean {
  return auth !== 'loading' && (!owner || (!!sync && sync.phase !== 'loading'));
}

export interface SyncHost {
  getData(): AppData;
  setData(d: AppData): void;
  getRuns(): PuzzleRun[];
  setRuns(r: PuzzleRun[]): void;
  onState(s: SyncState): void;
}

const BASE_KEY = 'poker-trainer:synced';
const SAVE_DELAY_MS = 800;
const RETRY_MS = 15_000;

/** Turn whatever went wrong into words for the player. */
export function syncMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/fetch|network|Failed to fetch|Load failed/i.test(m)) return 'Could not reach your account. Check your connection.';
  if (/JWT|expired|not signed in|42501|401/i.test(m)) return 'Your sign-in has expired. Sign in again to keep saving.';
  return 'Your account could not be reached.';
}

export class AccountSync {
  private base: SyncBase | null = null;
  private loaded = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<boolean> = Promise.resolve(true);

  constructor(
    private readonly owner: string,
    private readonly store: AccountStore,
    private readonly host: SyncHost,
  ) {}

  private readBase(): SyncBase | null {
    try {
      const s = localStorage.getItem(ownedKey(BASE_KEY, this.owner));
      return s ? (JSON.parse(s) as SyncBase) : null;
    } catch {
      return null;
    }
  }

  private writeBase(b: SyncBase) {
    this.base = b;
    try {
      localStorage.setItem(ownedKey(BASE_KEY, this.owner), JSON.stringify(b));
    } catch {
      /* kept for this visit */
    }
  }

  /** Load the account and merge it with this browser's copy. Until this succeeds nothing is saved to the account. */
  async start(): Promise<boolean> {
    this.host.onState({ phase: 'loading' });
    try {
      const remote = await this.store.fetch();
      if (this.stopped) return false;
      const base = this.readBase() ?? freshBase(this.host.getData(), this.host.getRuns());
      const merged = applyRemote(this.host.getData(), this.host.getRuns(), base, remote);
      this.host.setData(merged.data);
      this.host.setRuns(merged.runs);
      this.writeBase(merged.base);
      this.loaded = true;
      this.host.onState({ phase: 'ready', saving: false });
      this.schedule(0);
      return true;
    } catch (e) {
      if (!this.stopped) this.host.onState({ phase: 'load-failed', message: syncMessage(e) });
      return false;
    }
  }

  get isLoaded() {
    return this.loaded;
  }

  /** The account has saved settings (so a guest's settings should not replace them). */
  get accountHasSettings() {
    return !!this.base?.doc.settings;
  }

  /** Save soon (changes come in bursts: a hand, then its review). */
  schedule(delay = SAVE_DELAY_MS) {
    if (!this.loaded || this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Save everything not yet in the account. Saves run one at a time; resolves true once the account has it all. */
  flush(): Promise<boolean> {
    if (!this.loaded || this.stopped) return Promise.resolve(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue = this.queue.then(() => this.saveOnce());
    return this.queue;
  }

  private async saveOnce(): Promise<boolean> {
    if (this.stopped) return false;
    this.host.onState({ phase: 'ready', saving: true });
    try {
      await this.push();
      if (!this.stopped) this.host.onState({ phase: 'ready', saving: false });
      return true;
    } catch (e) {
      if (!this.stopped) {
        this.host.onState({ phase: 'save-failed', message: syncMessage(e) });
        this.timer = setTimeout(() => void this.flush(), RETRY_MS);
      }
      return false;
    }
  }

  private async push() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const base = this.base!;
      const changes = pendingChanges(this.host.getData(), this.host.getRuns(), base);
      if (changes.hands.length) {
        for (let i = 0; i < changes.hands.length; i += 200) await this.store.saveHands(changes.hands.slice(i, i + 200));
        if (this.stopped) return;
        this.writeBase({ ...this.base!, hands: { ...this.base!.hands, ...Object.fromEntries(changes.hands.map((x) => [x.record.id, handSig(x.record)])) } });
      }
      if (changes.runs.length) {
        await this.store.saveRuns(changes.runs);
        if (this.stopped) return;
        this.writeBase({ ...this.base!, runs: [...this.base!.runs, ...changes.runs.map((r) => r.id)] });
      }
      if (!changes.doc) return;
      const r = await this.store.saveDoc(Math.max(0, this.base!.revision), changes.doc);
      if (this.stopped) return;
      if (r.saved) {
        this.writeBase({ ...this.base!, revision: r.revision, doc: changes.doc });
        return;
      }
      // another device saved first: put our changes on top of its copy and try again
      const merged = mergeDoc(this.base!.doc, changes.doc, r.doc);
      this.host.setData(applyDoc(this.host.getData(), merged));
      this.writeBase({ ...this.base!, revision: r.revision, doc: r.doc });
    }
    throw new Error('Progress kept changing on another device');
  }

  /** The Progress page's reset (or a "replace" import): clear the account, then save what is here now. */
  async resetAccount(): Promise<void> {
    if (!this.loaded) throw new Error('Your account is not loaded yet');
    await this.store.reset();
    const remote = await this.store.fetch();
    this.writeBase({ revision: remote.revision, doc: remote.doc, hands: {}, runs: remote.runs.map((r) => r.id) });
    await this.flush();
  }

  /** Merge a guest's progress into this account and save it. Resolves true once the account has it. */
  async importGuest(guest: AppData, guestRuns: PuzzleRun[]): Promise<boolean> {
    if (!this.loaded) return false;
    const merged = mergeGuest(this.host.getData(), this.host.getRuns(), guest, guestRuns, this.accountHasSettings);
    this.host.setData(merged.data);
    this.host.setRuns(merged.runs);
    return this.flush();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
