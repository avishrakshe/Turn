// The docs table of contents. The single source for the sidebar, prev/next links, search,
// static params and page metadata. Content lives in content/docs/<slug>.mdx.

export interface DocPage {
  slug: string; // "" for the overview at /docs
  title: string;
  description: string;
}

export interface DocGroup {
  title: string;
  pages: DocPage[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Start here",
    pages: [
      { slug: "", title: "Overview", description: "What Turn is, and why it uses a blockchain at all." },
      { slug: "onchain", title: "Onchain, precisely", description: "Exactly which steps touch the blockchain, who signs and pays for each, and what gets recorded." },
      { slug: "accounts", title: "Accounts & passkeys", description: "Face ID accounts, gasless payments, and exactly what auto-pay may do." },
      { slug: "money", title: "Money", description: "Why the pot is held in a dollar stablecoin, and how your own currency fits in." },
    ],
  },
  {
    title: "How circles work",
    pages: [
      { slug: "circles", title: "Circles", description: "The life of a circle, from invite to the last payout, and every setting." },
      { slug: "bidding", title: "Bidding", description: "Sealed bids for an early turn, and how the discount is shared." },
      { slug: "safety", title: "Safety", description: "Safety deposits, the protection reserve, and what happens when someone stops paying." },
      { slug: "turn-score", title: "Turn Score", description: "A public record of paying on time, and how any app can read it." },
    ],
  },
  {
    title: "For builders",
    pages: [
      { slug: "automation", title: "Automation", description: "How rounds run on time without anyone pressing a button." },
      { slug: "data", title: "Data", description: "The indexer, its entities, and example queries." },
      { slug: "contracts", title: "Contracts", description: "Addresses, events and ABIs for every network." },
      { slug: "security", title: "Security", description: "Threat model, invariants, testing, and known limitations." },
      { slug: "builders-faq", title: "FAQ for builders", description: "Integrating with Turn, reading scores, and running your own keeper." },
    ],
  },
];

export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((g) => g.pages);

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

export function findDoc(slug: string): { page: DocPage; prev?: DocPage; next?: DocPage } | null {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (i < 0) return null;
  return { page: DOC_PAGES[i]!, prev: DOC_PAGES[i - 1], next: DOC_PAGES[i + 1] };
}

/** File name under content/docs for a slug. */
export const docFile = (slug: string) => (slug || "overview") + ".mdx";
