import { Redis } from '@upstash/redis';

type Store = { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, opts?: { ex?: number }) => Promise<void> };

declare global { var __memKV: Map<string, { value: unknown; exp: number }> | undefined }

function makeMemoryStore(): Store {
  const map = (globalThis.__memKV ??= new Map());
  return {
    async get(k) {
      const entry = map.get(k);
      if (!entry) return null;
      if (Date.now() > entry.exp) { map.delete(k); return null; }
      return entry.value;
    },
    async set(k, v, opts) {
      const ttl = opts?.ex ?? 600;
      map.set(k, { value: v, exp: Date.now() + ttl * 1000 });
    },
  };
}

const store: Store = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN }) as unknown as Store
  : makeMemoryStore();

export default store;
