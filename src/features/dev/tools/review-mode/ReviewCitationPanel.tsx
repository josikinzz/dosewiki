"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge, Button, Surface } from "@/components/ui";
import { copyCitationTag } from "@/features/dev/forms/QuickAddReferenceCard";
import {
  buildCitationNumbering,
  formatWikipediaStyleReference,
} from "@/lib/citations/referenceModel";
import type { SubstanceArticle } from "@/schema";
import type { Reference } from "@/schema/substance/shared";
import { cn } from "@/lib/utils";

export interface ReviewCitationPanelProps {
  /** Article whose sources are listed; recomputed when its references change. */
  article: SubstanceArticle;
  /** Display name for the panel heading. */
  name: string;
  /** Collapse the panel. */
  onClose: () => void;
  /** Must match the toggle button's `aria-controls`. */
  id: string;
  className?: string;
}

/**
 * The citation palette for the review workbench (`C`), inline between the bar
 * and the article like the molecule panel.
 *
 * Read-only plus clipboard, by design: it lists the article's sources with
 * their public citation numbers and a Copy `[cite:id]` button, and the
 * reviewer pastes the marker into an inline edit. It creates no write surface
 * of its own — new sources still come from the Editor view's quick-add card,
 * and markers land through the same inline-edit path as any other text change.
 *
 * It is also where broken citation data is loud, because the public page now
 * refuses to show it (`renderCitedText` drops unresolvable markers instead of
 * printing "?"): dangling markers are listed with their raw ids, and uncited
 * references are flagged as publicly invisible.
 */
export function ReviewCitationPanel({
  article,
  name,
  onClose,
  id,
  className,
}: ReviewCitationPanelProps) {
  const headingId = `${id}-heading`;

  const { numberedReferences, uncitedReferences, unknownIds } = useMemo(() => {
    const numbering = buildCitationNumbering(article.references ?? [], article);
    const numberedIds = new Set(
      numbering.numberedReferences.map((reference) => reference.id),
    );
    const uncited = Array.from(numbering.referencesById.values()).filter(
      (reference) => !numberedIds.has(reference.id),
    );
    return {
      numberedReferences: numbering.numberedReferences,
      uncitedReferences: uncited,
      unknownIds: numbering.unknownIds,
    };
  }, [article]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const copyMarker = async (referenceId: string) => {
    const copied = await copyCitationTag(referenceId);
    if (!copied) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedId(referenceId);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 1600);
  };

  const copyButton = (referenceId: string) => (
    <Button
      variant="pill"
      size="pill"
      className="shrink-0 gap-1.5"
      onClick={() => void copyMarker(referenceId)}
      title={`Copy [cite:${referenceId}] to paste into an inline edit`}
      aria-label={`Copy the citation marker for ${referenceId}`}
    >
      <Icon
        icon={copiedId === referenceId ? "lucide:check" : "lucide:copy"}
        size={13}
      />
      {copiedId === referenceId ? "Copied" : "Copy marker"}
    </Button>
  );

  const referenceText = (reference: Reference) =>
    formatWikipediaStyleReference(reference);

  const isEmpty =
    numberedReferences.length === 0 &&
    uncitedReferences.length === 0 &&
    unknownIds.length === 0;

  return (
    <Surface
      asChild
      variant="card"
      padding="none"
      radius="xl"
      className={cn("overflow-hidden", className)}
    >
      <section id={id} aria-labelledby={headingId}>
        {/* border-dose-divider, not the raw theme var: new files must pass the
            token audit, and this is the hairline the review bar already uses. */}
        <div className="flex items-start gap-3 border-b border-dose-divider px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <Icon
              icon="lucide:book-marked"
              size={15}
              className="theme-text-secondary shrink-0"
            />
            <h2
              id={headingId}
              className="theme-text-primary font-display min-w-0 truncate text-sm font-semibold leading-none"
            >
              Citations — {name}
            </h2>
            <p className="theme-text-faint min-w-0 text-[11px] leading-tight">
              Copy a marker, then paste it into an inline edit. A source with no
              marker never appears publicly.
            </p>
          </div>
          <Button
            variant="iconClose"
            size="auto"
            className="shrink-0"
            onClick={onClose}
            title="Close the citation panel (C)"
            aria-label="Close the citation panel"
          >
            <Icon icon="lucide:x" size={15} />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {isEmpty ? (
            <p className="theme-text-faint text-sm">
              This article has no structured references yet. Add sources from
              the Editor view&rsquo;s &ldquo;Add a reference&rdquo; card, then
              come back here to place markers.
            </p>
          ) : null}

          {numberedReferences.length > 0 ? (
            <ul className="space-y-2">
              {numberedReferences.map((reference) => (
                <li
                  key={reference.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <span className="theme-citation-marker mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-xs font-semibold tabular-nums">
                    {reference.number}
                  </span>
                  <span className="theme-text-secondary min-w-0 flex-1 leading-snug">
                    {reference.referenceTextResolved}
                  </span>
                  {copyButton(reference.id)}
                </li>
              ))}
            </ul>
          ) : null}

          {uncitedReferences.length > 0 ? (
            <div className="space-y-2">
              <p className="theme-text-faint text-[11px] uppercase tracking-wide">
                Uncited — invisible on the public page until a marker cites them
              </p>
              <ul className="space-y-2">
                {uncitedReferences.map((reference) => (
                  <li
                    key={reference.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Badge variant="outline" className="mt-0.5 shrink-0 px-1.5 py-0.5 tracking-normal">
                      uncited
                    </Badge>
                    <span className="theme-text-secondary min-w-0 flex-1 leading-snug">
                      {referenceText(reference)}
                    </span>
                    {copyButton(reference.id)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {unknownIds.length > 0 ? (
            <div className="space-y-2">
              <p className="theme-text-faint text-[11px] uppercase tracking-wide">
                Dangling markers — no matching reference, hidden from readers
              </p>
              <ul className="space-y-1.5">
                {unknownIds.map((unknownId) => (
                  <li
                    key={unknownId}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Badge variant="destructive" className="shrink-0 px-1.5 py-0.5 tracking-normal">
                      dangling
                    </Badge>
                    <code className="theme-text-secondary min-w-0 flex-1 truncate font-mono text-xs">
                      [cite:{unknownId}]
                    </code>
                  </li>
                ))}
              </ul>
              <p className="theme-text-faint text-xs leading-snug">
                These tokens exist in the article text but match no reference,
                so the public page silently drops them. Fix the id, add the
                missing source, or delete the token in an inline edit.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </Surface>
  );
}
