"use client";

import { AppSkeleton } from "@/components/app/AppSkeleton";
import { SettingsScreen } from "@/components/app/SettingsScreen";
import { useHydrated } from "@/lib/app/hooks";

export default function SettingsPage() {
  return useHydrated() ? <SettingsScreen /> : <AppSkeleton />;
}
