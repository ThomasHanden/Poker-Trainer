import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppData, load, save, persistentStorageAvailable } from '../persistence/storage';

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replaceAll: (d: AppData) => void;
  storageWarning: string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => load());
  const [warning, setWarning] = useState<string | null>(persistentStorageAvailable() ? null : 'Browser storage is unavailable (private mode or blocked). Progress will be lost when you close this tab — use Export on the Progress page to keep it.');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const r = save(data);
    if (!r.ok) setWarning(`Could not save progress: ${r.error}`);
    else if (r.error) setWarning(r.error);
  }, [data]);
  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);
  const replaceAll = useCallback((d: AppData) => setData(d), []);
  const v = useMemo(() => ({ data, update, replaceAll, storageWarning: warning }), [data, update, replaceAll, warning]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
