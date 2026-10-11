"use client";

import { ScoreScreen } from "@/components/app/ScoreScreen";
import { SignInGate } from "@/components/app/SignInGate";

export default function ScorePage() {
  return (
    <SignInGate>
      <ScoreScreen />
    </SignInGate>
  );
}