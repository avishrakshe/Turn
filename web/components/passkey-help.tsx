"use client";
// Friendly recovery when a device's passkeys can't do what Turn needs (e.g. some Windows Hello setups).
import { Icon } from "./icons";
import { Button, Sheet } from "./ui";

export function PasskeyHelp({ open, onClose, onRetry }: { open: boolean; onClose: () => void; onRetry: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Let's use your phone">
      <p className="text-muted">
        This computer's Face ID / Windows Hello can't create a Turn key yet. Your phone can, and it only takes a moment.
      </p>
      <ol className="flex flex-col gap-3">
        {[
          { icon: "face" as const, text: "Tap Try again below." },
          { icon: "link" as const, text: 'In the window that opens, choose "Use a phone or tablet".' },
          { icon: "check" as const, text: "Scan the QR code with your phone's camera and confirm with Face ID or your fingerprint." },
        ].map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-ink">
              <Icon name={s.icon} size={16} />
            </span>
            <span className="pt-1 text-sm">{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Works with iPhone (iOS 18+) and Android phones. Or simply open this page on your phone.</p>
      <Button
        onClick={() => {
          onClose();
          onRetry();
        }}
      >
        Try again
      </Button>
    </Sheet>
  );
}
