"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RequireAccount } from "@/components/gate";
import { useSession } from "@/lib/session";

function Me() {
  const { address } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (address) router.replace(`/credit/${address}`);
  }, [address, router]);
  return null;
}

export default function Page() {
  return (
    <RequireAccount title="My record">
      <Me />
    </RequireAccount>
  );
}
