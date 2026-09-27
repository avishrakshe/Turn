"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { search, type SearchEntry, type SearchHit } from "@/lib/docs-search";

/** Docs search: a button that opens a dialog, also on "/" or Ctrl/⌘ K. */
export function Search() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const open = useCallback(() => {
    dialog.current?.showModal();
    input.current?.focus();
    if (!index) {
      fetch("/docs/search-index")
        .then((r) => r.json())
        .then(setIndex)
        .catch(() => setIndex([]));
    }
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hits: SearchHit[] = index ? search(index, query) : [];

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    dialog.current?.close();
    setQuery("");
    router.push(hit.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search docs"
        className="border-line bg-paper-raised text-ink-muted hover:border-line-strong flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-pill border px-3 text-sm sm:w-56 sm:justify-start sm:px-4"
      >
        <svg viewBox="0 0 20 20" className="size-4 shrink-0" aria-hidden>
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline" aria-hidden>Search docs</span>
        <kbd className="border-line ms-auto hidden rounded border px-1.5 font-sans text-xs sm:inline">/</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="Search docs"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="bg-paper-raised text-ink shadow-lift m-auto mt-[12vh] w-[min(640px,calc(100%-2rem))] max-w-none rounded-card border-0 p-0 backdrop:bg-[rgb(20_14_8/0.45)]"
      >
        <div className="border-line flex items-center gap-3 border-b px-5">
          <svg viewBox="0 0 20 20" className="text-ink-muted size-5 shrink-0" aria-hidden>
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={listId}
            aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
            aria-label="Search docs"
            placeholder="Search, for example “reserve” or “passkey”"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(hits[active]);
              }
            }}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-faint"
          />
          <button type="button" onClick={() => dialog.current?.close()} className="text-ink-muted hover:bg-paper-sunk -me-2 min-h-11 rounded-lg px-2 text-sm">
            Esc
          </button>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-2">
          {query.trim().length > 1 && index && hits.length === 0 && <li className="text-ink-muted px-4 py-6 text-center">No results for “{query}”.</li>}
          {!index && query && <li className="text-ink-muted px-4 py-6 text-center">Loading…</li>}
          {hits.map((h, i) => (
            <li
              key={h.href + i}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={cn("cursor-pointer rounded-xl px-4 py-3", i === active && "bg-marigold-soft")}
            >
              <p className="text-sm font-semibold">
                {h.page}
                {h.heading && <span className="text-ink-muted font-normal"> › {h.heading}</span>}
              </p>
              <p className="text-ink-muted mt-0.5 line-clamp-2 text-sm">{h.snippet}</p>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
