// Tiny key-value store for server routes. Upstash Redis (REST) when configured, in-memory otherwise (local dev).
// Only non-secret data goes here: vault *ciphertext*, onboarding timings, feedback answers.
import "server-only";

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  push(key: string, value: string): Promise<void>;
  list(key: string, max: number): Promise<string[]>;
}

class MemoryKV implements KV {
  private m = new Map<string, string>();
  private l = new Map<string, string[]>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.m.set(k, v);
  }
  async push(k: string, v: string) {
    const arr = this.l.get(k) ?? [];
    arr.unshift(v);
    this.l.set(k, arr.slice(0, 5000));
  }
  async list(k: string, max: number) {
    return (this.l.get(k) ?? []).slice(0, max);
  }
}

/** Upstash Redis REST: POST a JSON command array to the base URL (https://upstash.com/docs/redis/features/restapi). */
class UpstashKV implements KV {
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`kv ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  }
  get(k: string) {
    return this.cmd<string | null>("GET", k);
  }
  async set(k: string, v: string) {
    await this.cmd("SET", k, v);
  }
  async push(k: string, v: string) {
    await this.cmd("LPUSH", k, v);
    await this.cmd("LTRIM", k, 0, 4999);
  }
  list(k: string, max: number) {
    return this.cmd<string[]>("LRANGE", k, 0, max - 1);
  }
}

const g = globalThis as unknown as { __turnKv?: KV };
export function kv(): KV {
  if (!g.__turnKv) {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    g.__turnKv = url && token ? new UpstashKV(url, token) : new MemoryKV();
  }
  return g.__turnKv;
}
