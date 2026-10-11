"use client";
// Time to first transaction: from the first time this tab opens the app to the first confirmed transaction,
// with the passkey prompt and taps along the way. Kept in sessionStorage (measurement only; nothing essential
// lives in browser storage) and sent once to /api/metrics, which /metrics reads.

type Run = { id: string; startedAt: number; passkeyAt?: number; firstTxAt?: number; taps: number; prompts: number; flow: string; sent?: boolean };
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

/** Starts the clock for a visitor who isn't signed in yet. Signed-in people aren't onboarding. */
export function startRun(flow: string) {
  if (typeof window === "undefined" || load()) return;
  save({ id: crypto.randomUUID(), startedAt: Date.now(), taps: 0, prompts: 0, flow });
}

export function setFlow(flow: string) {
  const r = load();
  if (r && !r.firstTxAt) save({ ...r, flow });
}

export function tap() {
  const r = load();
  if (r && !r.firstTxAt) save({ ...r, taps: r.taps + 1 });
}

export function track(event: "passkey" | "firstTx") {
  const r = load();
  if (!r || r.firstTxAt) return;
  if (event === "passkey") save({ ...r, passkeyAt: r.passkeyAt ?? Date.now(), prompts: r.prompts + 1 });
  if (event === "firstTx") {
    const done = { ...r, firstTxAt: Date.now() };
    save(done);
    fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(done) })
      .then((res) => res.ok && save({ ...done, sent: true }))
      .catch(() => {});
  }
}
