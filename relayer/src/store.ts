// Rate limiting and per-account gas budgets. In-memory by design for the hackathon deployment (one relayer
// instance); the interface is small so it can move to Redis/Postgres without touching the policy code.

export interface RelayerStore {
  /** Returns false when `key` has already been hit `limit` times in the current minute. */
  hit(key: string, limit: number, now?: number): boolean;
  gasUsedToday(account: string, now?: number): bigint;
  addGas(account: string, gas: bigint, now?: number): void;
}

const utcDay = (now: number) => Math.floor(now / 86_400_000);

export class MemoryStore implements RelayerStore {
  private windows = new Map<string, { minute: number; count: number }>();
  private gas = new Map<string, { day: number; used: bigint }>();

  hit(key: string, limit: number, now = Date.now()): boolean {
    const minute = Math.floor(now / 60_000);
    const w = this.windows.get(key);
    if (!w || w.minute !== minute) {
      this.windows.set(key, { minute, count: 1 });
      return true;
    }
    if (w.count >= limit) return false;
    w.count += 1;
    return true;
  }

  gasUsedToday(account: string, now = Date.now()): bigint {
    const g = this.gas.get(account.toLowerCase());
    return g && g.day === utcDay(now) ? g.used : 0n;
  }

  addGas(account: string, gas: bigint, now = Date.now()): void {
    const key = account.toLowerCase();
    const day = utcDay(now);
    const g = this.gas.get(key);
    this.gas.set(key, { day, used: (g && g.day === day ? g.used : 0n) + gas });
  }
}
