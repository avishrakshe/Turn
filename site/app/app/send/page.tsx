"use client";

import { SendScreen } from "@/components/app/SendScreen";
import { SignInGate } from "@/components/app/SignInGate";

export default function SendPage() {
  return (
    <SignInGate>
      <SendScreen />
    </SignInGate>
  );
}