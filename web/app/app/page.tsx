import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "App", robots: { index: false } };

// Placeholder until the app UI lands (phase 4).
export default function AppHome() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <EmptyState
        title="The app is on its way"
        body="Creating and joining circles opens here soon. Until then, you can try a whole circle in the simulation."
        action={
          <Link href="/#demo" className="text-teal-ink min-h-11 font-semibold underline underline-offset-4">
            Try the simulation
          </Link>
        }
      />
    </main>
  );
}
