import { describe, expect, it } from "vitest";
import { en } from "./en";
import { hi } from "./hi";
import { LANGUAGES, translate } from "./index";
import { ml } from "./ml";
import { ta } from "./ta";
import { ur } from "./ur";

const catalogs = { hi, ml, ta, ur };

/** Every string leaf, keyed by its path ("common.months.one", "create.steps.0"). */
function leaves(node: unknown, path = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") out.set(path, node);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) for (const [p, s] of leaves(v, path ? `${path}.${k}` : k)) out.set(p, s);
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translation catalogs", () => {
  const source = leaves(en);

  for (const [lang, messages] of Object.entries(catalogs)) {
    it(`${lang} has every English string, non-empty, with the same placeholders`, () => {
      const target = leaves(messages);
      expect([...target.keys()].sort()).toEqual([...source.keys()].sort());
      for (const [path, english] of source) {
        const s = target.get(path)!;
        expect(s.trim(), path).not.toBe("");
        // A language's "one" form may drop {count} ("एक महीना"), but may not invent placeholders.
        if (path.endsWith(".one")) for (const p of placeholders(s)) expect(placeholders(english), path).toContain(p);
        else expect(placeholders(s), path).toEqual(placeholders(english));
      }
    });
  }

  it("lists a catalog for every language", () => {
    for (const l of LANGUAGES) expect(translate(l.code, "welcome.start")).not.toBe("welcome.start");
  });
});

describe("translate", () => {
  it("picks plural forms by each language's rules", () => {
    expect(translate("en", "common.months", { count: 1 })).toBe("1 month");
    expect(translate("en", "common.months", { count: 0 })).toBe("0 months");
    // Hindi treats 0 like 1.
    expect(translate("hi", "common.months", { count: 0 })).toBe(translate("hi", "common.months", { count: 1 }).replace("1", "0"));
  });

  it("isolates values in Urdu, but leaves URLs bare so chat apps link them", () => {
    const s = translate("ur", "share.whatsappText", { name: "Family", amount: "AED 220", frequency: "ماہانہ", url: "https://turn.example/app/join/x" });
    expect(s).toContain("⁨AED 220⁩");
    expect(s).toContain("⁨Family⁩");
    expect(s).toMatch(/ https:\/\/turn\.example\/app\/join\/x$/);
  });

  it("leaves left-to-right languages untouched", () => {
    expect(translate("hi", "share.body", { count: 2, name: "Family" })).not.toMatch(/[⁨⁩]/);
  });

  it("falls back to the key for unknown messages", () => {
    expect(translate("ta", "nope.missing")).toBe("nope.missing");
  });
});
