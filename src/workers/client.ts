// Promise-based client for the engine worker. Falls back to running tasks on the main thread
// (in small async chunks) if Web Workers are unavailable, so the app still works.

import type { TaskRequest } from './tasks';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      console.warn('Engine worker failed; falling back to the main thread.', e.message);
      workerFailed = true;
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(new Error('worker-crashed'));
      }
    };
  } catch (e) {
    console.warn('Web Worker unavailable; computations run on the main thread.', e);
    workerFailed = true;
    worker = null;
  }
  return worker;
}

export const usingWorker = () => !!getWorker();

async function runLocal<T>(req: TaskRequest): Promise<T> {
  const { runTask } = await import('./tasks');
  await new Promise((r) => setTimeout(r, 0));
  return runTask(req) as T;
}

export async function run<T>(req: TaskRequest): Promise<T> {
  const w = getWorker();
  if (!w) return runLocal<T>(req);
  const id = nextId++;
  try {
    return await new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ id, req });
    });
  } catch (e) {
    if ((e as Error).message === 'worker-crashed') return runLocal<T>(req);
    throw e;
  }
}
