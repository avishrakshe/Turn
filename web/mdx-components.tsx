import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";
import { ContractAddresses, Source } from "@/components/docs/Contracts";
import { Callout, PlainWords, UnderTheHood } from "@/components/docs/Layers";
import { Mermaid } from "@/components/docs/Mermaid";

// Headings get a hover anchor so any section can be linked to.
function heading(Tag: "h2" | "h3") {
  return function Heading({ id, children, ...rest }: ComponentProps<"h2">) {
    return (
      <Tag id={id} {...rest} className="group scroll-mt-24">
        {children}
        {id && (
          <a href={`#${id}`} className="text-ink-faint ms-2 no-underline opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Link to this section">
            #
          </a>
        )}
      </Tag>
    );
  };
}

const components: MDXComponents = {
  h2: heading("h2"),
  h3: heading("h3"),
  a: ({ href = "", ...rest }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} {...rest} />
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest} />
    ),
  table: (props) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
  PlainWords,
  UnderTheHood,
  Callout,
  Mermaid,
  ContractAddresses,
  Source,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
