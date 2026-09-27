"use client";

import { Home } from "@/components/app/Home";
import { Welcome } from "@/components/app/Welcome";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { useHydrated, useStore } from "@/lib/app/hooks";

export default function AppHome() {
  const hydrated = useHydrated();
  const signedIn = useStore((s) => s.profile !== null);
  if (!hydrated) return <AppSkeleton />;
  return signedIn ? <Home /> : <Welcome />;
}
