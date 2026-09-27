"use client";

import { AppSkeleton } from "@/components/app/AppSkeleton";
import { CreateFlow } from "@/components/app/CreateFlow";
import { useHydrated } from "@/lib/app/hooks";

export default function CreatePage() {
  return useHydrated() ? <CreateFlow /> : <AppSkeleton />;
}
