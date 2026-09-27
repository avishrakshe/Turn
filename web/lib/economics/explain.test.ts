import { describe, expect, it } from "vitest";
import { advance, type Circle, createCircle } from "./engine";
import { explain } from "./explain";

const ctx = { name: (id: string) => id, money: (x: bigint) => `₹${x}`, youId: "You" };

function circle(): Circle {
  return createCircle(
    { contribution: 5000n, mode: "FIXED_ORDER", maxDiscountBps: 0, entryDeposit: 5000n, reserveBps: 2000 },
    ["Arjun", "You", "Fatima", "Ravi", "Meera"].map((id) => ({ id, name: id })),
  );
}

describe("simulation explanations", () => {
  it("explains a miss before winning as covered by the joining deposit, with the ejection warning", () => {
    // "You" is first in line, so Arjun hasn't won when missing month 1.
    const c = createCircle(circle().params, ["You", "Arjun", "Fatima", "Ravi", "Meera"].map((id) => ({ id, name: id })));
    const lines = explain(advance(c, { missed: ["Arjun"] }).events, ctx);
    expect(lines.join(" ")).toContain("The deposit Arjun paid when joining covered ₹5000");
    expect(lines.join(" ")).toContain("If Arjun misses again before their turn");
  });

  it("explains a miss after winning as covered by the held-back safety deposit", () => {
    let c = circle();
    c = advance(c).circle; // Arjun wins month 1
    const lines = explain(advance(c, { missed: ["Arjun"] }).events, ctx);
    expect(lines.join(" ")).toContain("The safety deposit held back from Arjun's payout covered ₹5000");
    expect(lines.join(" ")).toContain("Nobody else is affected");
  });

  it("explains an ejection and the 90% refund", () => {
    let c = createCircle(circle().params, ["You", "Fatima", "Ravi", "Meera", "Arjun"].map((id) => ({ id, name: id })));
    c = advance(c).circle;
    c = advance(c, { missed: ["Arjun"] }).circle;
    const lines = explain(advance(c, { missed: ["Arjun"] }).events, ctx);
    expect(lines[0]).toContain("Arjun missed a second time");
    expect(lines[0]).toContain("₹9000 (90% of what they put in)");
  });

  it("uses 'You' for the visitor", () => {
    const lines = explain(advance(createCircle(circle().params, ["You", "A", "B"].map((id) => ({ id, name: id })))).events, ctx);
    expect(lines.join(" ")).toContain("You receive");
  });
});
