"use client";

import type { MouseEvent } from "react";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import type { ProjectedCitation } from "@/lib/citationProjection";

export type CitationBacklink = {
  href: string;
  label: string;
  occurrenceIndex: number;
  referenceId: string;
};

function expandCollapsedArticleControls() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]'),
  ).filter((button) => button.getAttribute("aria-label")?.startsWith("Expand "));

  for (const button of buttons) {
    button.click();
  }
}

export function scrollToReferenceUse(referenceId: string, occurrenceIndex: number, href: string) {
  const scroll = () => {
    const markers = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        `a.theme-citation-marker[data-reference-id="${CSS.escape(referenceId)}"]`,
      ),
    ).filter((marker) => !document.getElementById("sources")?.contains(marker));
    const target = markers[occurrenceIndex] ?? markers[0] ?? document.querySelector<HTMLElement>(href);

    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    document.querySelector<HTMLElement>("#sources")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  expandCollapsedArticleControls();
  window.requestAnimationFrame(() => window.requestAnimationFrame(scroll));
}

function ReferenceLabel({ label }: { label: string }) {
  const linkMatch = label.match(/(https?:\/\/\S+)$/);

  if (linkMatch?.index === undefined) {
    return <>{label}</>;
  }

  const text = label.slice(0, linkMatch.index).trimEnd();
  const url = linkMatch[0];

  return (
    <>
      {text}{" "}
      <span
        className={cn(
          // Safari's hyphenation suppresses overflow-wrap breaks inside long
          // unhyphenatable runs, so URLs must opt out and break-all instead.
          "break-all hyphens-none",
          "font-medium text-[color:var(--theme-accent-strong)] underline decoration-[color:color-mix(in_srgb,var(--theme-accent)_36%,transparent)] underline-offset-[0.18em]",
          "transition-colors group-hover:text-[color:var(--theme-accent)] group-hover:decoration-[color:color-mix(in_srgb,var(--theme-accent)_62%,transparent)]",
        )}
      >
        {url}
      </span>
    </>
  );
}

function CitationUseBacklinks({
  citation,
  links,
}: {
  citation: ProjectedCitation;
  links?: CitationBacklink[];
}) {
  if (!links || links.length === 0) return null;

  const handleBacklinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    link: CitationBacklink,
  ) => {
    event.preventDefault();
    scrollToReferenceUse(link.referenceId, link.occurrenceIndex, link.href);
  };

  return (
    <span
      className={cn(
        "theme-citation-marker relative -top-[0.28em] ml-1.5 inline-flex h-[1em] items-center gap-[0.3em] rounded-[0.12rem] px-[0.32em] align-baseline",
        "text-[0.68em] font-semibold leading-none tabular-nums",
      )}
      aria-label={`Uses of citation ${citation.number}`}
    >
      <Icon icon="lucide:arrow-up" size="0.95em" className="shrink-0" />
      {links.map((link) => (
        <a
          key={`${citation.referenceId ?? citation.anchorId}-${link.label}`}
          href={link.href}
          onClick={(event) => handleBacklinkClick(event, link)}
          className={cn(
            "inline-flex h-[1.12em] min-w-[1.12em] items-center justify-center rounded-[0.12rem] px-[0.22em]",
            "text-current transition-colors hover:bg-[color:color-mix(in_srgb,var(--theme-accent-soft)_18%,var(--theme-body-bg))]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
          )}
          aria-label={`Go to use ${link.label} of citation ${citation.number}`}
        >
          {link.label}
        </a>
      ))}
    </span>
  );
}

export function ReferenceListItem({
  citation,
  backlinks,
}: {
  citation: ProjectedCitation;
  backlinks?: CitationBacklink[];
}) {
  const content = (
    <span className="theme-reference-label hyphenate transition-colors">
      <ReferenceLabel label={citation.label} />
    </span>
  );

  return (
    <li
      id={citation.anchorId}
      className={cn(
        "group grid max-w-full scroll-mt-20 grid-cols-[2rem_minmax(0,1fr)] gap-2.5",
        "text-[0.8125rem] leading-[1.55] sm:text-[0.875rem]",
      )}
    >
      <span
        className={cn(
          "inline-flex h-[1.35rem] min-w-[1.35rem] items-center justify-center justify-self-end rounded-[0.12rem] px-1 text-[0.72rem] font-semibold leading-none tabular-nums",
          "theme-reference-number",
        )}
        aria-hidden="true"
      >
        {citation.number}
      </span>
      <span className="hyphenate min-w-0 max-w-full sm:max-w-[82ch]">
        {citation.url ? (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "theme-reference-link hyphenate underline underline-offset-[0.18em]",
              "transition-colors focus-visible:outline-none",
            )}
          >
            {content}
          </a>
        ) : (
          content
        )}
        <CitationUseBacklinks citation={citation} links={backlinks} />
      </span>
    </li>
  );
}

/**
 * Wikipedia-style numbered reference list shared by substance and effect
 * articles: plum number chip, full citation text, accent-colored trailing
 * URL, and optional per-use backlinks.
 */
export function ReferenceCitationList({
  citations,
  referenceBacklinks,
}: {
  citations: readonly ProjectedCitation[];
  referenceBacklinks?: Record<string, CitationBacklink[]>;
}) {
  return (
    <ol className="max-w-full list-none space-y-3 p-0">
      {citations.map((citation) => (
        <ReferenceListItem
          key={`${citation.anchorId}-${citation.referenceId ?? citation.url}`}
          citation={citation}
          backlinks={citation.referenceId ? referenceBacklinks?.[citation.referenceId] : undefined}
        />
      ))}
    </ol>
  );
}
