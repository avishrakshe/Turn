"use client";
// Time-to-first-transaction: counted from the first visit in this tab to the first confirmed transaction.
// Kept in sessionStorage (a convenience for measurement only; nothing essential lives in browser storage).

type Run = { id: string; startedAt: number; passkeyAt?: number; firstTxAt?: number; taps: number; flow: string; sent?: boolean };
const KEY = "turn.ttft";

function load(): Run | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Run) : null;
  } catch {
    return null;
  }
}
function save(r: Run) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(r));
  } catch {}
}

export function startRun(flow: string) {
  if (typeof window === "undefined" || load()) return;
  save({ id: crypto.randomUUID(), startedAt: Date.now(), taps: 0, flow });
}

export function tap() {
  const r = load();
  if (r && !r.firstTxAt) save({ ...r, taps: r.taps + 1 });
}

export function track(event: "passkey" | "firstTx") {
  const r = load();
  if (!r) return;
  if (event === "passkey" && !r.passkeyAt) save({ ...r, passkeyAt: Date.now() });
  if (event === "firstTx" && !r.firstTxAt) {
    const done = { ...r, firstTxAt: Date.now() };
    save(done);
    if (!done.sent) {
      fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(done) })
        .then(() => save({ ...done, sent: true }))
        .catch(() => {});
    }
  }
}

export function currentRun(): Run | null {
  return load();
}
