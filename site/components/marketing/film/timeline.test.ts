import { describe, expect, it } from "vitest";
import { buildFilm, heldNode, ledger, MEMBERS, POT, progressAt, RESERVE, runCircle, SEATS, seatNode, telemetry, timeAt } from "./timeline";

const film = buildFilm();
const { rounds } = runCircle();
const endOf = (phase: string, month: number) => film.beats.find((b) => b.phase === phase && b.month === month)!.t1;

describe("landing film", () => {
  it("lays beats end to end and warps time monotonically", () => {
    for (let i = 1; i < film.beats.length; i++) expect(film.beats[i]!.t0).toBeCloseTo(film.beats[i - 1]!.t1);
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const t = timeAt(film, p);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(progressAt(film, t)).toBeCloseTo(Math.min(p, 1), 6);
      prev = t;
    }
    expect(timeAt(film, 1)).toBeCloseTo(film.duration);
  });

  it("never lets a stack go below zero", () => {
    const times = film.flights.flatMap((f) => [f.t0, f.t1]).sort((a, b) => a - b);
    for (const t of times) {
      const { count, value } = ledger(film.flights, t + 1e-9);
      for (let s = 0; s < SEATS; s++) {
        expect(count[heldNode(s)]).toBeGreaterThanOrEqual(0);
        expect(value[heldNode(s)]).toBeGreaterThanOrEqual(0);
      }
      expect(count[POT]).toBeGreaterThanOrEqual(0);
      expect(value[RESERVE]).toBeGreaterThanOrEqual(0);
    }
  });

  it("holds exactly what the engine holds after every month", () => {
    for (const { month, after } of rounds.slice(0, -1)) {
      const { value } = ledger(film.flights, endOf("payout", month));
      expect(value[POT]).toBe(0);
      expect(value[RESERVE]).toBe(Number(after.reserve));
      after.members.forEach((m, i) => {
        expect(value[heldNode(i)], `${m.name} after month ${month}`).toBe(Number(m.deposit + m.collateral + m.claimable));
      });
    }
  });

  it("fills the pot to the engine's pot, and empties everything at the end", () => {
    const tm = telemetry(film, endOf("collect", 1));
    expect(tm.pot).toBe(30000);
    expect(tm.paid).toBe(SEATS);
    const missed = telemetry(film, endOf("collect", 4));
    expect(missed.pot).toBe(30000);
    expect(missed.paid).toBe(SEATS - 1);
    expect(missed.covered).toBe(1);

    const { value } = ledger(film.flights, film.duration);
    for (let s = 0; s < SEATS; s++) expect(value[heldNode(s)]).toBe(0);
    expect(value[POT]).toBe(0);
    expect(value[RESERVE]).toBe(0);
  });

  it("leaves each member with the engine's net result", () => {
    // A seat is the member's pocket: everything that flew to it minus everything that left it.
    // Credit arrives as a mote and leaves inside a full contribution, so it nets out exactly.
    const { value } = ledger(film.flights, film.duration);
    rounds.at(-1)!.after.members.forEach((m, i) => {
      expect(value[seatNode(i)], MEMBERS[i]!.name).toBe(-Number(m.paidIn - m.paidOut));
    });
  });

  it("writes captions from the engine's numbers", () => {
    const text = film.transcript.join(" ");
    expect(text).toContain("Meera receives ₹7,600 now.");
    expect(text).toContain("₹20,000 stays behind as a safety deposit");
    expect(text).toContain("₹384 off each of the other five members’ next payment, and ₹480 into the circle’s reserve");
    expect(text).toContain("Arjun misses this month’s payment.");
    expect(text).toContain("₹192 each");
    expect(text).not.toMatch(/\b(he|she|his|her)\b/i);
  });
});
