import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

/** Simple long-form page (privacy, terms) in the marketing shell. */
export function ProsePage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main id="main" className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-24">
        <h1 className="text-5xl">{title}</h1>
        <p className="text-ink-muted mt-3 text-sm">Last updated {updated}</p>
        <div className="[&_h2]:font-display [&_a]:text-teal-ink mt-10 space-y-5 text-lg leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h2]:pt-6 [&_h2]:text-2xl [&_li]:ms-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
