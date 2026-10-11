"use client";

import { AppSkeleton } from "@/components/app/AppSkeleton";
import { Home } from "@/components/app/Home";
import { Welcome } from "@/components/app/Welcome";
import { useHydrated } from "@/lib/app/hooks";
import { useSession } from "@/lib/live/session";

export default function AppHome() {
  const hydrated = useHydrated();
  const { address } = useSession();
  if (!hydrated) return <AppSkeleton />;
  return address ? <Home /> : <Welcome />;
}