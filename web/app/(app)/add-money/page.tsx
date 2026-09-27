"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAccount } from "@/components/gate";
import { Icon } from "@/components/icons";
import { usePrefs } from "@/components/providers";
import { Button, Card, Notice, Pill, Screen } from "@/components/ui";
import { useToast } from "@/components/ui";
import { run, testDollarsCall } from "@/lib/actions";
import { config } from "@/lib/config";
import { useBalance } from "@/lib/hooks";
import { fmt } from "@/lib/money";
import { useSession } from "@/lib/session";

function AddMoney() {
  const { ensureAccount } = useSession();
  const { currency, rates } = usePrefs();
  const balance = useBalance();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const grant = 500_000_000n;

  return (
    <Screen title="Add money" back="/home">
      <section className="rise rounded-[28px] bg-gradient-to-br from-primary to-primary-deep p-5 text-primary-ink">
        <p className="text-sm font-semibold opacity-80">Your money</p>
        <p className="num mt-1 font-display text-[36px] font-extrabold leading-tight">
          {balance.data === undefined ? <span className="inline-block h-9 w-36 animate-pulse rounded-xl bg-primary-ink/15 align-middle" /> : fmt(balance.data, currency, rates)}
        </p>
        <p className="mt-1 text-xs opacity-75">Held in US dollars · shown in {currency}</p>
      </section>

      <Card className="rise-2 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Icon name="wallet" size={21} />
          </span>
          <div className="flex-1">
            <h2 className="font-extrabold">Card, bank or UPI</h2>
            <p className="text-xs text-muted">Apple Pay · Google Pay · local methods</p>
          </div>
          <Pill>Soon</Pill>
        </div>
        <p className="text-sm text-muted">
          Add money in your own currency through our payment partner. It arrives as dollars in your Turn account, ready for your circles.
        </p>
        <Button variant="secondary" disabled>
          Coming soon
        </Button>
      </Card>

      {config.testToken && (
        <Card className="rise-3 flex flex-col gap-4 border-dashed">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-warn">
              <Icon name="sparkle" size={21} />
            </span>
            <div className="flex-1">
              <h2 className="font-extrabold">Test money</h2>
              <p className="text-xs text-muted">Beta on a test network</p>
            </div>
          </div>
          <p className="text-sm text-muted">Get free test dollars to try circles with family and friends. No fees, no card.</p>
          {err && (
            <Notice tone="bad" icon="info">
              {err}
            </Notice>
          )}
          <Button
            variant="accent"
            icon="plus"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const account = await ensureAccount();
                await run(account, testDollarsCall(account.address, grant));
                await qc.invalidateQueries({ queryKey: ["balance"] });
                toast(`Added ${fmt(grant, currency, rates)} in test money`);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Get {fmt(grant, currency, rates)} test money
          </Button>
        </Card>
      )}
    </Screen>
  );
}

export default function Page() {
  return (
    <RequireAccount title="Add money">
      <AddMoney />
    </RequireAccount>
  );
}
