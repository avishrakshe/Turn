import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOC_PAGES, docFile, docHref } from "@/lib/docs";
import { type SearchEntry, sectionsFromMdx, slugify } from "@/lib/docs-search";

// Built once at build time and served as a static JSON file.
export const dynamic = "force-static";

export async function GET() {
  const entries: SearchEntry[] = [];
  for (const page of DOC_PAGES) {
    const source = await readFile(join(process.cwd(), "content", "docs", docFile(page.slug)), "utf8");
    for (const s of sectionsFromMdx(source)) {
      const base = docHref(page.slug);
      entries.push({
        href: s.heading ? `${base}#${slugify(s.heading)}` : base,
        page: page.title,
        heading: s.heading,
        text: s.heading ? s.text : `${page.description} ${s.text}`.trim(),
      });
    }
  }
  return Response.json(entries);
}
