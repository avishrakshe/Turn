"use client";

import { AppSkeleton } from "@/components/app/AppSkeleton";
import { ScoreScreen } from "@/components/app/ScoreScreen";
import { useHydrated } from "@/lib/app/hooks";

export default function ScorePage() {
  return useHydrated() ? <ScoreScreen /> : <AppSkeleton />;
}
