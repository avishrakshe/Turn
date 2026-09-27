import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DESCRIPTION, TAGLINE } from "@/lib/site";

export const alt = `Turn · ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#fbf6ee";
const INK = "#2b211a";
const TEAL = "#0e5c55";
const MARIGOLD = "#eea722";
const AVATARS = ["#f3c98b", "#b9dccf", "#f0b8a4", "#cfc4ea", "#c6dd9f", "#a9cde6"];
const INITIALS = ["P", "A", "F", "R", "M", "S"];

export default async function OgImage() {
  const [display, sans] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Fraunces-SemiBold-Soft.ttf")),
    readFile(join(process.cwd(), "assets/fonts/DMSans-Medium.ttf")),
  ]);

  const R = 190;
  const c = 250;
  const seats = INITIALS.map((t, i) => {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    return { t, x: c + R * Math.cos(a), y: c + R * Math.sin(a), fill: AVATARS[i]!, lit: i === 1 };
  });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, padding: "64px 72px", fontFamily: "DM Sans" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Fraunces", fontSize: 40 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: MARIGOLD }} />
            Turn
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Fraunces", fontSize: 92, lineHeight: 1, marginTop: 36, letterSpacing: -2 }}>
            <span>Save together.</span>
            <span style={{ color: TEAL }}>Take turns.</span>
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.35, marginTop: 32, maxWidth: 560, color: "#66574b" }}>{DESCRIPTION}</div>
        </div>
        <div style={{ display: "flex", width: 500, height: 500, position: "relative", alignSelf: "center" }}>
          <svg width="500" height="500" viewBox="0 0 500 500" style={{ position: "absolute", top: 0, left: 0 }}>
            <circle cx={c} cy={c} r={R} fill="none" stroke="#cdbca4" strokeWidth="3" strokeDasharray="3 12" strokeLinecap="round" />
            <path d={`M ${c} ${c - R} A ${R} ${R} 0 0 1 ${seats[1]!.x} ${seats[1]!.y}`} fill="none" stroke={MARIGOLD} strokeWidth="8" strokeLinecap="round" opacity="0.6" />
            <circle cx={seats[1]!.x} cy={seats[1]!.y} r="62" fill="#fbe8c2" />
            <circle cx={seats[1]!.x} cy={seats[1]!.y} r="55" fill="none" stroke={MARIGOLD} strokeWidth="7" />
            {seats.map((s) => (
              <circle key={s.t} cx={s.x} cy={s.y} r="44" fill={s.fill} stroke={PAPER} strokeWidth="5" />
            ))}
          </svg>
          {seats.map((s) => (
            <div
              key={s.t}
              style={{ position: "absolute", left: s.x - 44, top: s.y - 44, width: 88, height: 88, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, color: INK }}
            >
              {s.t}
            </div>
          ))}
          <div style={{ position: "absolute", left: 150, top: 205, width: 200, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 22, color: "#66574b" }}>
            <span>This month&rsquo;s pot</span>
            <span style={{ fontFamily: "Fraunces", fontSize: 48, color: INK, marginTop: 4 }}>₹30,000</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: display, weight: 600, style: "normal" },
        { name: "DM Sans", data: sans, weight: 500, style: "normal" },
      ],
    },
  );
}
