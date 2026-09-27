"use client";

import { use } from "react";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { CircleScreen } from "@/components/app/CircleScreen";
import { useHydrated } from "@/lib/app/hooks";

export default function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return useHydrated() ? <CircleScreen id={id} /> : <AppSkeleton />;
}
