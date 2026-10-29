/// <reference lib="webworker" />
import { runTask, TaskRequest } from './tasks';

self.onmessage = (e: MessageEvent<{ id: number; req: TaskRequest }>) => {
  const { id, req } = e.data;
  try {
    const result = runTask(req);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
