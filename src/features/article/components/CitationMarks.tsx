"use client";

// The two reader-visible leaves of inline citation rendering. They live apart
// from `CitedText` so `renderCitedText` stays callable on the server (the
// harm-potential section renders `ArticleText` there) while the accessible
// label and the caution marker still translate through the client `useT`.
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export type CitationSupProps = Omit<
  ComponentPropsWithoutRef<"sup">,
  "children"
> & {
  citations: CitationLink[];
  linkClassName?: string;
  onCitationClick?: (citation: CitationLink, event: MouseEvent<HTMLAnchorElement>) => void;
};

export type CitationLink = {
  /**
   * Catalog key for the marker's aria-label (`msg("Citation {{number}}")`);
   * `{{number}}` resolves to `label` at render time.
   */
  accessibleLabel: string;
  href: string;
  label: string;
  referenceId?: string;
  title?: string;
};

export function CitationSup({
  className,
  citations,
  linkClassName,
  onCitationClick,
  ...props
}: CitationSupProps) {
  const t = useT();
  return (
    <sup
      className={cn(
        "relative -top-[0.42em] ml-0.5 inline-flex gap-[0.32em] align-baseline text-[0.62em] leading-none",
        className,
      )}
      {...props}
    >
      {citations.map((citation, index) => (
        <a
          key={`${citation.href}-${citation.label}-${index}`}
          href={citation.href}
          data-reference-id={citation.referenceId}
          aria-label={t(citation.accessibleLabel, { number: citation.label })}
          title={citation.title}
          onClick={onCitationClick ? (event) => onCitationClick(citation, event) : undefined}
          className={cn(
            "theme-citation-marker inline-flex items-center rounded-[0.12rem] px-[0.22em] py-[0.02em] font-medium leading-[1.05] tabular-nums no-underline",
            linkClassName,
          )}
        >
          {citation.label}
        </a>
      ))}
    </sup>
  );
}

/**
 * Free-floating inline marker for the `[citation-needed]` sentinel the
 * citation campaign leaves behind when a claim's marker is stripped. Compact
 * superscript-register caution text, no pill, no chrome, with the brackets
 * drawn as CSS pseudo-elements so the sentinel never re-enters the copy
 * stream. It never participates in reference numbering, and renderCitedText
 * suppresses it when the claim already carries a resolved citation or when
 * the previous claim in the same block is already flagged.
 */
export function CitationNeededMarker() {
  const t = useT();
  return (
    <span className="theme-citation-needed-marker relative -top-[0.42em] ml-0.5 inline-block whitespace-nowrap align-baseline text-[0.62em] italic leading-none">
      {t("citation needed")}
    </span>
  );
}
