"use client";
// The Turn wheel: members sit around the circle, the pot sits in the middle, and the ring fills as turns are taken.
// Received = check badge; this round's recipient glows marigold; you get a ring.
import type { ReactNode } from "react";
import { avatarColor } from "./ui";

export type WheelMember = { address: string; name?: string; received: boolean; me: boolean; out?: boolean };

export function TurnWheel({
  members,
  current,
  progress,
  size = 280,
  children,
}: {
  members: WheelMember[];
  current?: string | null;
  /** 0..1 of rounds done */
  progress: number;
  size?: number;
  children?: ReactNode;
}) {
  const c = size / 2;
  const r = size / 2 - 30;
  const circ = 2 * Math.PI * r;
  const n = Math.max(members.length, 1);
  const avatar = Math.min(46, Math.max(30, (2 * Math.PI * r) / n - 10));

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id="wheel-progress" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={10} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="url(#wheel-progress)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${circ * Math.min(1, Math.max(0, progress))} ${circ}`}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.2,.8,.2,1)" }}
        />
        <circle cx={c} cy={c} r={r - 34} fill="var(--surface)" stroke="var(--line)" />
      </svg>

      {members.map((m, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = c + r * Math.cos(angle) - avatar / 2;
        const y = c + r * Math.sin(angle) - avatar / 2;
        const isCurrent = current && current.toLowerCase() === m.address.toLowerCase();
        const initials = (m.me ? "You" : m.name ?? "")
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div
            key={m.address}
            className={`absolute flex items-center justify-center rounded-full font-bold text-white transition ${isCurrent ? "glow" : ""} ${m.out ? "opacity-35 grayscale" : ""}`}
            style={{
              left: x,
              top: y,
              width: avatar,
              height: avatar,
              fontSize: avatar * 0.34,
              background: `linear-gradient(145deg, ${avatarColor(m.address)}, ${avatarColor(m.address)}cc)`,
              boxShadow: isCurrent ? "0 0 0 3px var(--accent)" : m.me ? "0 0 0 3px var(--primary)" : "0 0 0 3px var(--surface)",
            }}
            title={m.me ? "You" : m.name}
          >
            {m.me ? "You" : initials || "•"}
            {m.received && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-good text-white ring-2 ring-surface">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            )}
          </div>
        );
      })}

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
