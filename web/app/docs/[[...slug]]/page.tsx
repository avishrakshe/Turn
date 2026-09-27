import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Toc } from "@/components/docs/Toc";
import { DOC_PAGES, docFile, docHref, findDoc } from "@/lib/docs";

type Params = { slug?: string[] };

export function generateStaticParams(): Params[] {
  return DOC_PAGES.map((p) => ({ slug: p.slug ? [p.slug] : [] }));
}

export const dynamicParams = false;

const slugOf = (params: Params) => (params.slug ?? []).join("/");

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const found = findDoc(slugOf(await params));
  if (!found) return {};
  const { page } = found;
  return {
    title: page.slug ? `${page.title} · Docs` : "Docs: How Turn uses the blockchain",
    description: page.description,
    alternates: { canonical: docHref(page.slug) },
  };
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const found = findDoc(slugOf(await params));
  if (!found) notFound();
  const { page, prev, next } = found;
  const { default: Content } = await import(`@/content/docs/${docFile(page.slug)}`);

  return (
    <>
      <main id="doc-content" className="min-w-0 py-10 lg:py-14">
        <article className="docs-prose mx-auto max-w-3xl">
          <p className="chapter">{page.slug ? "Docs" : "Docs · How Turn uses the blockchain"}</p>
          <h1>{page.title}</h1>
          <p className="lead">{page.description}</p>
          <p className="not-prose text-ink-muted border-line mt-6 flex gap-2 border-y py-3 text-sm">
            <span aria-hidden className="bg-warning mt-2 size-1.5 shrink-0 rounded-full" />
            <span>
              Beta, unaudited, being built. These pages describe the design the contracts implement. Addresses and source links appear
              here as each piece is deployed.
            </span>
          </p>
          <details className="not-prose border-line bg-paper-raised mt-6 rounded-2xl border px-4 xl:hidden">
            <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold">On this page</summary>
            <div className="pb-4">
              <Toc />
            </div>
          </details>
          <Content />
        </article>
        <nav aria-label="Previous and next page" className="border-line mx-auto mt-16 grid max-w-3xl gap-3 border-t pt-8 sm:grid-cols-2">
          {prev ? (
            <Link href={docHref(prev.slug)} className="border-line hover:border-line-strong rounded-2xl border p-4">
              <span className="text-ink-muted text-xs">Previous</span>
              <span className="mt-1 block font-semibold">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={docHref(next.slug)} className="border-line hover:border-line-strong rounded-2xl border p-4 text-end">
              <span className="text-ink-muted text-xs">Next</span>
              <span className="mt-1 block font-semibold">{next.title}</span>
            </Link>
          )}
        </nav>
      </main>
      <aside className="hidden xl:block">
        <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto py-14">
          <Toc />
        </div>
      </aside>
    </>
  );
}
