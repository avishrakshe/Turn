import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app/AppProvider";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = { title: { default: "Your circles", template: "%s · Turn" }, robots: { index: false } };
export const viewport: Viewport = { viewportFit: "cover" };

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
