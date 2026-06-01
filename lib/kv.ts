type Store = { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, opts?: { ex?: number }) => Promise<void> };

function makeMemoryStore(): Store {
  const map = new Map<string, { value: unknown; exp: number }>();
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

const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

let store: Store;

if (hasKV) {
  const { kv } = await import('@vercel/kv');
  store = kv as unknown as Store;
} else {
  store = makeMemoryStore();
}

export default store;
