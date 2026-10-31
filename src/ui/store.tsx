import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppData, load, save, persistentStorageAvailable, setOwner, forgetOwner, reset as resetLocal } from '../persistence/storage';
import { AccountSync, guestSummary, hasGuestProgress, syncMessage, type GuestSummary, type SyncState } from '../persistence/accountSync';
import { clearRuns, loadRuns, onRunSaved, writeRuns } from '../puzzles/daily';
import { supabaseAccountStore } from '../auth/accountStore';
import { supabase } from '../auth/supabase';
import { useAuth } from '../auth/AuthContext';
import { track } from './analytics';

/** reset: the Progress page's reset; replace: an import that replaces everything; merge: an import added to what is there */
export type ReplaceIntent = 'reset' | 'replace' | 'merge';

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replaceAll: (d: AppData, intent?: ReplaceIntent) => void;
  storageWarning: string | null;
  /** whose data this is: null for a guest, else the signed-in account's id */
  owner: string | null;
  /** saving to the account (null for guests) */
  sync: SyncState | null;
  retrySync: () => void;
  /** goes up whenever puzzle results are replaced from the account */
  runsVersion: number;
  /** guest progress in this browser that could be added to the account */
  guest: GuestSummary | null;
  importGuest: () => Promise<boolean>;
  dismissGuest: () => void;
  /** recent changes have not reached the account yet */
  unsaved: boolean;
}

const Ctx = createContext<Store | null>(null);
const SIGN_OUT_SAVE_MS = 4000;
const dismissedKey = (owner: string) => `guest-import-dismissed@${owner}`;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { status, account, beforeSignOut } = useAuth();
  const owner = status === 'signed-in' && account ? account.id : null;
  const settled = status !== 'loading';
  const [data, setData] = useState<AppData>(() => load(null));
  const dataRef = useRef(data);
  const ownerRef = useRef<string | null>(null);
  const skipSave = useRef(true);
  /** signing out: nothing more is saved for the account that is leaving */
  const leaving = useRef(false);
  const syncRef = useRef<AccountSync | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [runsVersion, setRunsVersion] = useState(0);
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [warning, setWarning] = useState<string | null>(persistentStorageAvailable() ? null : 'Browser storage is unavailable (private mode or blocked). Progress will be lost when you close this tab — use Export on the Progress page to keep it.');

  const put = useCallback((d: AppData) => {
    dataRef.current = d;
    setData(d);
  }, []);

  // whose data is shown: this browser's guest progress, or the signed-in account's (loaded from the
  // account, with this browser's own copy of it underneath)
  useEffect(() => {
    if (!settled) return;
    setOwner(owner);
    ownerRef.current = owner;
    leaving.current = false;
    skipSave.current = true;
    put(load(owner));
    setGuest(null);
    if (!owner || !supabase) {
      setSync(null);
      return;
    }
    const s = new AccountSync(owner, supabaseAccountStore(supabase), {
      getData: () => dataRef.current,
      setData: put,
      getRuns: () => loadRuns(owner),
      setRuns: (runs) => {
        writeRuns(runs, owner);
        setRunsVersion((v) => v + 1);
      },
      onState: setSync,
    });
    syncRef.current = s;
    onRunSaved(() => s.schedule());
    void s.start().then((ok) => {
      if (!ok) return;
      const summary = guestSummary(load(null), loadRuns(null));
      let dismissed = false;
      try {
        dismissed = !!sessionStorage.getItem(dismissedKey(owner));
      } catch {
        /* offer it */
      }
      if (hasGuestProgress(summary) && !dismissed) setGuest(summary);
    });
    return () => {
      s.stop();
      onRunSaved(null);
      if (syncRef.current === s) syncRef.current = null;
    };
  }, [owner, settled, put, attempt]);

  // keep this browser's copy, and send changes to the account
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (leaving.current) return;
    const r = save(data, ownerRef.current);
    if (!r.ok) setWarning(`Could not save progress: ${r.error}`);
    else if (r.error) setWarning(r.error);
    syncRef.current?.schedule();
  }, [data]);

  // signing out: save what we can, then forget this device's copy of the account (shared devices)
  useEffect(
    () =>
      beforeSignOut(async () => {
        const s = syncRef.current;
        const who = ownerRef.current;
        if (s) await Promise.race([s.flush(), new Promise((r) => setTimeout(r, SIGN_OUT_SAVE_MS))]);
        // stop first: a load still on its way must not write the account back after it is forgotten
        s?.stop();
        leaving.current = true;
        if (who) forgetOwner(who);
      }),
    [beforeSignOut],
  );

  const update = useCallback((fn: (d: AppData) => AppData) => put(fn(dataRef.current)), [put]);

  const replaceAll = useCallback(
    (d: AppData, intent: ReplaceIntent = 'merge') => {
      put(d);
      const s = syncRef.current;
      if (s && intent !== 'merge') s.resetAccount().catch((e) => setSync({ phase: 'save-failed', message: syncMessage(e) }));
    },
    [put],
  );

  const retrySync = useCallback(() => {
    if (sync?.phase === 'load-failed') setAttempt((a) => a + 1);
    else void syncRef.current?.flush();
  }, [sync]);

  const importGuest = useCallback(async () => {
    const s = syncRef.current;
    if (!s) return false;
    // the guest copy stays in this browser until the account has saved it
    const ok = await s.importGuest(load(null), loadRuns(null));
    if (ok) {
      resetLocal(null);
      clearRuns(null);
      setGuest(null);
      track('Guest Progress Imported');
    } else track('Guest Progress Import Failed');
    return ok;
  }, []);

  const dismissGuest = useCallback(() => {
    if (ownerRef.current)
      try {
        sessionStorage.setItem(dismissedKey(ownerRef.current), '1');
      } catch {
        /* asked again next time */
      }
    setGuest(null);
  }, []);

  const unsaved = !!sync && (sync.phase === 'save-failed' || sync.phase === 'load-failed' || (sync.phase === 'ready' && sync.saving));
  const v = useMemo(
    () => ({ data, update, replaceAll, storageWarning: warning, owner, sync, retrySync, runsVersion, guest, importGuest, dismissGuest, unsaved }),
    [data, update, replaceAll, warning, owner, sync, retrySync, runsVersion, guest, importGuest, dismissGuest, unsaved],
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
