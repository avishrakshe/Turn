import { Skeleton } from "@/components/ui/Skeleton";

/** Shown for the moment before the browser's saved state is read. Skeletons, not spinners. */
export function AppSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-13 w-full rounded-pill" />
    </div>
  );
}
