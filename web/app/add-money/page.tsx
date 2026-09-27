"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAccount } from "@/components/gate";
import { usePrefs } from "@/components/providers";
import { Button, Card, Notice, Screen } from "@/components/ui";
import { run, testDollarsCall } from "@/lib/actions";
import { config } from "@/lib/config";
import { useBalance } from "@/lib/hooks";
import { fmt } from "@/lib/money";
import { useSession } from "@/lib/session";

function AddMoney() {
  const { account } = useSession();
  const { currency, rates } = usePrefs();
  const balance = useBalance();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  return (
    <Screen title="Add money" back="/home">
      <Card>
        <p className="text-sm text-muted">Your money</p>
        <p className="num text-3xl font-extrabold">{balance.data === undefined ? "…" : fmt(balance.data, currency, rates)}</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">Pay with card or bank</h2>
        <p className="text-sm text-muted">
          Add money in your own currency with a card, Apple Pay or Google Pay through our payment partner. It arrives as dollars in your Turn account,
          ready for your circles.
        </p>
        <Button variant="secondary" disabled>
          Coming soon
        </Button>
      </Card>

      {config.testToken && (
        <Card className="flex flex-col gap-3 border-dashed">
          <h2 className="font-extrabold">Test money</h2>
          <p className="text-sm text-muted">Turn is in beta on a test network. Get free test dollars to try circles with family and friends.</p>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button
            loading={busy}
            onClick={async () => {
              if (!account) return;
              setBusy(true);
              setMsg(null);
              try {
                await run(account, testDollarsCall(account.address, 500_000_000n));
                await qc.invalidateQueries({ queryKey: ["balance"] });
                setMsg({ tone: "good", text: `Added ${fmt(500_000_000n, currency, rates)} in test money.` });
              } catch (e) {
                setMsg({ tone: "bad", text: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            Get {fmt(500_000_000n, currency, rates)} test money
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
