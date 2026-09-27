import Link from "next/link";

// The app lives in a phone-sized frame: full screen on phones, a phone floating on a warm backdrop on desktop.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="app-backdrop min-h-dvh md:flex md:items-center md:justify-center md:gap-16 md:p-6">
      <aside className="hidden max-w-xs lg:block">
        <Link href="/" className="font-display text-3xl font-extrabold tracking-tight">
          Turn<span className="text-accent">.</span>
        </Link>
        <p className="mt-4 text-lg text-muted">Save together. Take turns.</p>
        <p className="mt-6 text-sm text-muted">
          Turn is made for your phone. Open this page on your phone to use Face ID, or keep going here with your computer's passkey.
        </p>
      </aside>
      <div className="app-frame relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-bg md:mx-0 md:h-[min(900px,calc(100dvh-48px))] md:min-h-0 md:overflow-y-auto md:rounded-[46px]">
        {children}
      </div>
    </div>
  );
}
