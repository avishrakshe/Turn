import { cn } from "@/lib/cn";
import { avatarTone, initials } from "@/components/ring/geometry";

/** Initials on a warm fill. Colour is derived from the name so it matches the member's ring seat. */
export function Avatar({ name, size = 40, turn, className }: { name: string; size?: number; turn?: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-[#2b211a]",
        turn ? "ring-marigold ring-offset-paper ring-[3px] ring-offset-2" : "ring-paper ring-2",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `var(--av-${avatarTone(name)})` }}
    >
      <span aria-hidden>{initials(name)}</span>
    </span>
  );
}
