"use client";

import { CreateFlow } from "@/components/app/CreateFlow";
import { SignInGate } from "@/components/app/SignInGate";

export default function CreatePage() {
  return (
    <SignInGate>
      <CreateFlow />
    </SignInGate>
  );
}