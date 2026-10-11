"use client";

import { SettingsScreen } from "@/components/app/SettingsScreen";
import { SignInGate } from "@/components/app/SignInGate";

export default function SettingsPage() {
  return (
    <SignInGate>
      <SettingsScreen />
    </SignInGate>
  );
}