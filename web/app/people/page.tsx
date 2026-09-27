"use client";
// Private address book (passkey "vault" namespace): names are encrypted on this device and stored only as ciphertext.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAccount } from "@/components/gate";
import { UnlockNames, useNames } from "@/components/names";
import { Avatar, Card, Screen } from "@/components/ui";
import { gql } from "@/lib/indexer";
import { useMyCircles } from "@/lib/hooks";
import { shortAddr } from "@/lib/money";
import { useSession } from "@/lib/session";

function People() {
  const { address } = useSession();
  const names = useNames();
  const my = useMyCircles();
  const circleIds = (my.data?.Membership ?? []).map((m) => m.circle_id);
  const people = useQuery({
    queryKey: ["people", circleIds.join()],
    enabled: circleIds.length > 0,
    queryFn: () =>
      gql<{ Membership: { member_id: string; circle_id: string }[] }>(
        `query ($ids: [String!]) { Membership(where: { circle_id: { _in: $ids } }) { member_id circle_id } }`,
        { ids: circleIds },
      ),
  });
  const unique = [...new Set((people.data?.Membership ?? []).map((m) => m.member_id))].filter((a) => a.toLowerCase() !== address?.toLowerCase());

  return (
    <Screen title="People" back="/settings">
      <UnlockNames />
      {names.error && <p className="text-sm text-bad">{names.error}</p>}
      <Card>
        {unique.length === 0 ? (
          <p className="text-muted">People from your circles will show up here.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {unique.map((a) => (
              <Row key={a} address={a} />
            ))}
          </ul>
        )}
      </Card>
      <p className="px-2 text-center text-xs text-muted">
        Encrypted with a key only your passkey can make. Open Turn on any phone with the same passkey and your names come back.
      </p>
    </Screen>
  );
}

function Row({ address }: { address: string }) {
  const names = useNames();
  const [value, setValue] = useState(names.personName(address) ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <li className="flex items-center gap-3">
      <Avatar seed={address} name={names.personName(address)} />
      {names.unlocked ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await names.setPerson(address, value);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={shortAddr(address)}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3"
            aria-label={`Name for ${shortAddr(address)}`}
          />
          <button className="px-2 text-sm font-bold text-primary">{saved ? "✓" : "Save"}</button>
        </form>
      ) : (
        <span className="flex-1 font-mono text-sm text-muted">{shortAddr(address)}</span>
      )}
    </li>
  );
}

export default function Page() {
  return (
    <RequireAccount title="People">
      <People />
    </RequireAccount>
  );
}
