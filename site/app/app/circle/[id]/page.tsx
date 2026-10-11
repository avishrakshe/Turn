"use client";

import { Suspense, use } from "react";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { CircleScreen } from "@/components/app/CircleScreen";
import { SignInGate } from "@/components/app/SignInGate";

export default function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <SignInGate>
      <Suspense fallback={<AppSkeleton />}>
        <CircleScreen id={id} />
      </Suspense>
    </SignInGate>
  );
}