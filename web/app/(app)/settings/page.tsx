"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { RequireAccount } from "@/components/gate";
import { Icon, type IconName } from "@/components/icons";
import { useNames } from "@/components/names";
import { usePrefs } from "@/components/providers";
import { Avatar, Button, Card, Notice, Pill, Row, Screen, SectionTitle, Sheet, useToast } from "@/components/ui";
import { currencyCall, renewCall, revokeCall, run } from "@/lib/actions";
import { config } from "@/lib/config";
import { useMyCircles, useNow } from "@/lib/hooks";
import { sessions } from "@/lib/indexer";
import { CURRENCIES, fmt, shortAddr } from "@/lib/money";
import { useSession } from "@/lib/session";

function Group({ children }: { children: ReactNode }) {
  return <Card className="divide-y divide-line px-4 py-1">{children}</Card>;
}

function Badge({ icon, tone = "primary" }: { icon: IconName; tone?: "primary" | "accent" | "blue" }) {
  const t = { primary: "bg-primary-soft text-primary", accent: "bg-accent-soft text-warn", blue: "bg-[#229ED9]/15 text-[#229ED9]" }[tone];
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${t}`}>
      <Icon name={icon} size={20} />
    </span>
  );
}

function Settings() {
  const { address, ensureAccount, confirm, exportPhrase, signOut } = useSession();
  const { currency, setCurrency, rates } = usePrefs();
  const names = useNames();
  const toast = useToast();
  const my = useMyCircles();
  const now = useNow(30_000);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const grants = useQuery({ queryKey: ["sessions", address], queryFn: () => sessions(address!), enabled: Boolean(address), refetchInterval: 5_000 });
  const activeSeats = (my.data?.Membership ?? []).filter((m) => m.status === "Active" && m.circle.status !== "Completed");
  const cur = CURRENCIES.find((c) => c.code === currency);

  async function act(label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await qc.invalidateQueries();
      if (done) toast(done);
    } catch (e) {
      setErr((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Settings" large>
      {/* Profile */}
      <Card className="rise flex items-center gap-4">
        <Avatar seed={address ?? "0x0"} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">Your Turn account</p>
          <button
            className="flex items-center gap-1 text-xs font-semibold text-muted"
            onClick={() => {
              void navigator.clipboard?.writeText(address ?? "");
              toast("Address copied", "neutral", "copy");
            }}
          >
            {shortAddr(address ?? "")} <Icon name="copy" size={12} />
          </button>
        </div>
        <Pill tone="good">
          <Icon name="face" size={12} /> Passkey
        </Pill>
      </Card>

      {err && (
        <Notice tone="bad" icon="info">
          {err}
        </Notice>
      )}

      <SectionTitle>Preferences</SectionTitle>
      <Group>
        <Row
          icon="globe"
          title="Show amounts in"
          subtitle="Your money is held in US dollars"
          onClick={() => setCurrencyOpen(true)}
          right={
            <span className="flex items-center gap-1 text-sm font-bold text-muted">
              {cur?.flag} {currency} <Icon name="chevron" size={16} />
            </span>
          }
        />
        <Row icon="users" title="Manage names" subtitle="Encrypted with your passkey" href="/people" />
        <a href={`https://t.me/${config.telegramBot}`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 py-3">
          <Badge icon="bell" tone="blue" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Updates on Telegram</span>
            <span className="block truncate text-xs text-muted">Collections, bidding and payouts · @{config.telegramBot}</span>
          </span>
          <Icon name="chevron" size={18} className="text-muted" />
        </a>
      </Group>

      <SectionTitle>Auto-pay</SectionTitle>
      <Group>
        {(grants.data?.Session ?? []).length === 0 && (
          <p className="py-4 text-sm text-muted">No auto-pay yet. It&apos;s set up when you join a circle.</p>
        )}
        {(grants.data?.Session ?? []).map((g) => {
          const seat = activeSeats.find((s) => s.circle_id.toLowerCase() === g.circle_id.toLowerCase());
          const expired = Number(g.validUntil) < now;
          const on = g.active && !expired;
          return (
            <div key={g.id} className="flex items-center gap-3 py-3">
              <Badge icon={on ? "repeat" : "pause"} tone={on ? "primary" : "accent"} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{names.circle(g.circle_id, "Circle")}</p>
                <p className="text-xs text-muted">
                  up to {fmt(g.maxAmount, currency, rates)} a round · {g.pulls} collected
                </p>
              </div>
              {on ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === `revoke-${g.id}`}
                  disabled={busy !== null}
                  onClick={() => act(`revoke-${g.id}`, async () => run(await confirm(), revokeCall(address as Address, g.circle_id as Address)), "Auto-pay turned off")}
                >
                  Turn off
                </Button>
              ) : seat ? (
                <Button
                  size="sm"
                  loading={busy === `renew-${g.id}`}
                  disabled={busy !== null}
                  onClick={() =>
                    act(
                      `renew-${g.id}`,
                      async () =>
                        run(await confirm(), renewCall(address as Address, g.circle_id as Address, BigInt(seat.circle.contribution), seat.circle.period, seat.circle.size)),
                      "Auto-pay is back on",
                    )
                  }
                >
                  {expired ? "Renew" : "Turn on"}
                </Button>
              ) : (
                <Pill>Off</Pill>
              )}
            </div>
          );
        })}
      </Group>
      <p className="-mt-2 px-1 text-xs text-muted">
        Each circle can collect only its own contribution, once per round, never more. Without auto-pay you&apos;ll tap &quot;Pay now&quot; each round.
      </p>

      <SectionTitle>Security</SectionTitle>
      <Group>
        <div className="flex flex-col gap-3 py-3">
          <div className="flex items-center gap-3">
            <Badge icon="key" tone="accent" />
            <div className="flex-1">
              <p className="font-semibold">Recovery phrase</p>
              <p className="text-xs text-muted">Your passkey is your backup. The phrase is optional.</p>
            </div>
          </div>
          {phrase ? (
            <>
              <Notice tone="bad" icon="lock">
                Never share these words. Anyone with them can take your money. Turn will never ask for them.
              </Notice>
              <ol className="grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-2 p-3" data-testid="phrase">
                {phrase.split(" ").map((w, i) => (
                  <li key={i} className="flex gap-1 rounded-lg bg-surface px-2 py-1.5 font-mono text-xs">
                    <span className="text-muted">{i + 1}</span>
                    {w}
                  </li>
                ))}
              </ol>
              <Button variant="secondary" size="md" onClick={() => setPhrase(null)}>
                Hide
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="md" icon="face" loading={busy === "phrase"} onClick={() => act("phrase", async () => setPhrase(await exportPhrase()))}>
              Reveal with Face ID
            </Button>
          )}
        </div>
        <Row icon="lock" title="Lock Turn" subtitle="Forget this device's session" onClick={signOut} />
      </Group>

      <p className="pb-2 text-center text-xs text-muted">Turn · save together, take turns</p>

      <Sheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} title="Show amounts in">
        <ul className="flex flex-col gap-1">
          {CURRENCIES.map((c) => (
            <li key={c.code}>
              <button
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ${c.code === currency ? "bg-primary-soft" : "hover:bg-surface-2"}`}
                onClick={() => {
                  setCurrencyOpen(false);
                  setCurrency(c.code);
                  // Saved with your circles so every device shows the same currency.
                  if (activeSeats.length)
                    void act("currency", async () => run(await ensureAccount(), activeSeats.flatMap((s) => currencyCall(s.circle_id as Address, c.code))), `Showing ${c.code}`);
                }}
              >
                <span className="text-2xl">{c.flag}</span>
                <span className="flex-1 font-semibold">{c.label}</span>
                {c.code === currency && <Icon name="check" size={18} className="text-primary" strokeWidth={3} />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </Screen>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Settings">
      <Settings />
    </RequireAccount>
  );
}
