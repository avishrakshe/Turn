"use client";

import { use } from "react";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { JoinScreen } from "@/components/app/JoinScreen";
import { useHydrated } from "@/lib/app/hooks";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return useHydrated() ? <JoinScreen code={code} /> : <AppSkeleton />;
}
