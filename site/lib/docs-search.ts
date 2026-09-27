// Tiny client-side search over the docs. The index is built at build time
// (app/docs/search-index/route.ts): one entry per section, with plain text.

export interface SearchEntry {
  href: string; // page path + optional #anchor
  page: string;
  heading: string | null;
  text: string;
}

export interface SearchHit extends SearchEntry {
  score: number;
  snippet: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD");

export function search(index: SearchEntry[], query: string, limit = 8): SearchHit[] {
  const terms = norm(query).split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const e of index) {
    const title = norm(`${e.page} ${e.heading ?? ""}`);
    const body = norm(e.text);
    let score = 0;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const inBody = body.includes(t);
      if (!inTitle && !inBody) {
        score = 0;
        break; // every term must match somewhere
      }
      score += (inTitle ? 5 : 0) + (inBody ? 1 + Math.min(3, body.split(t).length - 2) : 0);
    }
    if (score > 0) hits.push({ ...e, score, snippet: snippet(e.text, terms[0]!) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function snippet(text: string, term: string): string {
  const i = norm(text).indexOf(term);
  if (i < 0) return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  const start = Math.max(0, i - 50);
  return (start > 0 ? "…" : "") + text.slice(start, start + 140).trim() + (start + 140 < text.length ? "…" : "");
}

/** Strip MDX/markdown down to readable text, split into sections by ## / ### headings. */
export function sectionsFromMdx(source: string): Array<{ heading: string | null; text: string }> {
  const cleaned = source
    .replace(/^import .*$/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<Mermaid[\s\S]*?\/>/g, " ")
    .replace(/<\/?[A-Z][^>]*>/g, " ")
    .replace(/<\/?[a-z][^>]*>/g, " ");
  const out: Array<{ heading: string | null; text: string }> = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };
  for (const line of cleaned.split("\n")) {
    const m = /^#{2,3}\s+(.*)$/.exec(line);
    if (m) {
      out.push({ heading: current.heading, text: current.lines.join(" ") });
      current = { heading: m[1]!.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push({ heading: current.heading, text: current.lines.join(" ") });
  return out
    .map((s) => ({
      heading: s.heading,
      text: s.text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[`*_>|#-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((s) => s.text.length > 0 || s.heading);
}

/** Same slug rule as rehype-slug (github-slugger) for the simple headings we use. */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}
