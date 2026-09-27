import { cn } from "@/lib/cn";

/** A generic face-scan glyph for the passkey prompt (not any vendor's icon). */
export function FaceGlyph({ scanning, className }: { scanning?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("text-teal size-20", className)} aria-hidden>
      <path
        d="M8 22V14a6 6 0 016-6h8M42 8h8a6 6 0 016 6v8M56 42v8a6 6 0 01-6 6h-8M22 56h-8a6 6 0 01-6-6v-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M23 24v5M41 24v5M32 26v11h-3M24 42c4.5 4 11.5 4 16 0" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {scanning && (
        <rect x="10" y="10" width="44" height="3" rx="1.5" fill="var(--marigold)" className="animate-[scan_700ms_ease-in-out_infinite]" />
      )}
    </svg>
  );
}
