"use client";

// The two reader-visible leaves of inline citation rendering. They live apart
// from `CitedText` so `renderCitedText` stays callable on the server (the
// harm-potential section renders `ArticleText` there) while the accessible
// label and the caution marker still translate through the client `useT`.
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { findMarker, useFieldMarkers } from "@/features/article/editing/ArticleEditContext";
import { cn } from "@/lib/utils";

type CitationSupProps = Omit<
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
  markerOrdinal?: number;
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
  const fieldMarkers = useFieldMarkers();
  return (
    <sup
      className={cn(
        "relative -top-[0.42em] ml-0.5 inline-flex gap-[0.32em] align-baseline text-[0.62em] leading-none",
        className,
      )}
      {...props}
    >
      {citations.map((citation, index) => {
        const marker =
          fieldMarkers && citation.markerOrdinal !== undefined
            ? findMarker(fieldMarkers.markers, "cite", citation.markerOrdinal)
            : null;
        const citationClassName = cn(
          "theme-citation-marker theme-navigation-target inline-flex scroll-mt-20 items-center rounded-[0.12rem] px-[0.22em] py-[0.02em] font-medium leading-[1.05] tabular-nums no-underline",
          linkClassName,
        );

        if (!fieldMarkers || !marker) {
          return (
            <a
              key={`${citation.href}-${citation.label}-${index}`}
              href={citation.href}
              data-reference-id={citation.referenceId}
              aria-label={t(citation.accessibleLabel, { number: citation.label })}
              title={citation.title}
              onClick={
                onCitationClick ? (event) => onCitationClick(citation, event) : undefined
              }
              className={citationClassName}
            >
              {citation.label}
            </a>
          );
        }

        return (
          <DropdownMenu key={`${citation.href}-${citation.label}-${index}`}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-citation-control
                data-reference-id={citation.referenceId}
                aria-label={t(citation.accessibleLabel, { number: citation.label })}
                title={citation.title}
                className={citationClassName}
              >
                {citation.label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <a
                  href={citation.href}
                  onClick={
                    onCitationClick
                      ? (event) => onCitationClick(citation, event)
                      : undefined
                  }
                >
                  Open reference
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fieldMarkers.removeMarker(marker)}>
                Remove this citation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
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
export function CitationNeededMarker({ markerOrdinal }: { markerOrdinal?: number }) {
  const t = useT();
  const fieldMarkers = useFieldMarkers();
  const marker =
    fieldMarkers && markerOrdinal !== undefined
      ? findMarker(fieldMarkers.markers, "needed", markerOrdinal)
      : null;
  const className =
    "theme-citation-needed-marker relative -top-[0.42em] ml-0.5 inline-block whitespace-nowrap align-baseline text-[0.62em] italic leading-none";

  if (fieldMarkers && marker) {
    return (
      <button
        type="button"
        data-citation-control
        aria-label="Add a citation here"
        className={className}
        onClick={() => fieldMarkers.citeAtMarker(marker)}
      >
        {t("citation needed")}
      </button>
    );
  }

  return <span className={className}>{t("citation needed")}</span>;
}
