"use client";

import { Suspense, use } from "react";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { JoinScreen } from "@/components/app/JoinScreen";
import { useHydrated } from "@/lib/app/hooks";

/** /app/join/<circle address>?s=<invite secret>&n=<name>. Works signed out: joining creates the account. */
export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return useHydrated() ? (
    <Suspense fallback={<AppSkeleton />}>
      <JoinScreen code={code} />
    </Suspense>
  ) : (
    <AppSkeleton />
  );
}