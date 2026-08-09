"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Alert, Badge, Button, Input, Label, Surface } from "@/components/ui";
import { copyCitationTag } from "@/features/dev/forms/QuickAddReferenceCard";
import {
  buildQuickAddReference,
  detectQuickAddReference,
  fetchReferenceMetadata,
  hasReferenceMetadataLookup,
  type ReferenceMetadata,
} from "@/lib/citations/referenceIntake";
import {
  buildCitationNumbering,
  formatWikipediaStyleReference,
} from "@/lib/citations/referenceModel";
import type { SubstanceArticle } from "@/schema";
import type { Reference } from "@/schema/substance/shared";
import { cn } from "@/lib/utils";
import { findEquivalentReference } from "../../../../../lib/citations/referenceIdentity.mjs";

export interface ReviewCitationPanelProps {
  /** Article whose sources are listed; recomputed when its references change. */
  article: SubstanceArticle;
  /** Display name for the panel heading. */
  name: string;
  /** Collapse the panel. */
  onClose: () => void;
  /** Must match the toggle button's `aria-controls`. */
  id: string;
  /**
   * Which article a new source is written to. Optional because the panel can
   * read it off the article itself; pass it when the caller already knows.
   */
  slug?: string;
  className?: string;
}

/**
 * The slug of the article on screen.
 *
 * `SubstanceArticle` is the content contract and has no slug, but the record
 * the review workbench renders is the stored Convex document, which does — the
 * same narrow read the workbench itself does when it matches an article to a
 * queue entry. Without one there is nothing to address a write to, so the add
 * form stays hidden rather than failing at save time.
 */
function readArticleSlug(article: SubstanceArticle): string | null {
  const record = article as SubstanceArticle & { slug?: unknown };
  return typeof record.slug === "string" && record.slug.length > 0 ? record.slug : null;
}

/**
 * The citation palette for the review workbench (`C`), inline between the bar
 * and the article like the molecule panel.
 *
 * It lists the article's sources with their public citation numbers and a Copy
 * `[cite:id]` button, and the reviewer pastes the marker into an inline edit.
 * It also mints new sources: paste a DOI, PMID, ISBN, URL, or title, and the
 * reference is appended server-side and appears here as uncited, marker ready.
 * That closes the loop the palette used to break — spotting a claim that needs
 * a source no longer means leaving the queue for the Editor view.
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
  slug,
  className,
}: ReviewCitationPanelProps) {
  const headingId = `${id}-heading`;
  const articleSlug = slug ?? readArticleSlug(article);

  const { numberedReferences, uncitedReferences, unknownIds, knownIds, knownReferences } = useMemo(() => {
    const numbering = buildCitationNumbering(article.references ?? [], article);
    const numberedIds = new Set(
      numbering.numberedReferences.map((reference) => reference.id),
    );
    const references = Array.from(numbering.referencesById.values());
    const uncited = references.filter(
      (reference) => !numberedIds.has(reference.id),
    );
    return {
      numberedReferences: numbering.numberedReferences,
      uncitedReferences: uncited,
      unknownIds: numbering.unknownIds,
      knownIds: new Set(numbering.referencesById.keys()),
      knownReferences: references,
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

  // Sources added from this panel. Component-local state is already per-article
  // because the workbench mounts the panel with `key={slug}`, and the `article`
  // prop will not carry the new reference until the working set refreshes — so
  // the panel shows what it just wrote rather than appearing to have done
  // nothing. Re-added ids are deduped here too; the write is idempotent.
  const [addedReferences, setAddedReferences] = useState<Reference[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [source, setSource] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [metadata, setMetadata] = useState<ReferenceMetadata | null>(null);
  const [phase, setPhase] = useState<"idle" | "looking-up" | "saving">("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const sourceInputId = `${id}-add-source`;
  const titleInputId = `${id}-add-title`;

  const detection = detectQuickAddReference(source, draftTitle);
  const resolvedTitle = draftTitle.trim() || detection?.title?.trim() || "";
  // The preview is the reference that would be stored, assembled by the same
  // function the server uses — so what the reviewer reads here, including the
  // id they will copy a marker for, is what lands.
  const draftReference =
    detection && resolvedTitle
      ? buildQuickAddReference({
          detection,
          title: resolvedTitle,
          authors: metadata?.authors ?? [],
          year: metadata?.year ?? null,
          url: metadata?.url ?? null,
        })
      : null;

  const existingReference = detection
    ? findEquivalentReference(
        [...knownReferences, ...addedReferences],
        draftReference ?? detection,
      )
    : undefined;
  const alreadyPresent = Boolean(existingReference);
  const previewReference = existingReference ?? draftReference;

  const lookUpMetadata = async () => {
    const next = detectQuickAddReference(source, draftTitle);
    setMetadata(null);
    setAddError(null);
    setAddedNotice(null);
    // An ISBN, a bare URL, and a typed title have no service behind them, so
    // there is no pending state to show and nothing to wait for.
    if (!next || !hasReferenceMetadataLookup(next)) return;

    setPhase("looking-up");
    try {
      const found = await fetchReferenceMetadata(next);
      if (!found) return;
      setMetadata(found);
      // Only fills a blank title: a reviewer who typed one meant it.
      if (found.title && !draftTitle.trim()) setDraftTitle(found.title);
    } catch {
      setAddError(
        "That identifier could not be looked up. Type the title yourself and save anyway.",
      );
    } finally {
      setPhase("idle");
    }
  };

  const saveReference = async () => {
    if (!draftReference || !articleSlug || phase !== "idle") return;

    setPhase("saving");
    setAddError(null);
    setAddedNotice(null);
    try {
      const response = await fetch("/api/dev/article-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The pasted string travels, not the assembled reference: the route
        // re-derives the id and the identifier fields server-side.
        body: JSON.stringify({
          slug: articleSlug,
          source,
          title: resolvedTitle,
          authors: metadata?.authors ?? [],
          year: metadata?.year == null ? null : String(metadata.year),
          url: metadata?.url ?? null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
        created?: unknown;
        reference?: Reference;
      } | null;

      if (!response.ok) {
        setAddError(
          typeof payload?.error === "string"
            ? payload.error
            : "That source could not be saved.",
        );
        return;
      }

      const saved = payload?.reference;
      if (saved) {
        setAddedReferences((previous) =>
          previous.some((reference) => reference.id === saved.id)
            ? previous
            : [...previous, saved],
        );
        setAddedNotice(
          payload?.created === false
            ? `This article already lists that source as ${saved.id}.`
            : `Added ${saved.id}. Copy its marker below, then paste it where it belongs.`,
        );
      }
      setSource("");
      setDraftTitle("");
      setMetadata(null);
    } catch {
      // Deliberately sticky: a vanishing toast is exactly the wrong shape for
      // "your source was not saved".
      setAddError("That source could not be saved. Check the connection and try again.");
    } finally {
      setPhase("idle");
    }
  };

  // Anything written from this panel is uncited by definition — no marker names
  // it yet — so it joins that group until the article reloads with it in place.
  const pendingReferences = addedReferences.filter(
    (reference) => !knownIds.has(reference.id),
  );
  const uncitedEntries = [...uncitedReferences, ...pendingReferences];

  const isEmpty =
    numberedReferences.length === 0 &&
    uncitedEntries.length === 0 &&
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
          {articleSlug ? (
            <div className="space-y-3">
              {addOpen ? null : (
                <Button
                  variant="pill"
                  size="pill"
                  className="gap-1.5"
                  onClick={() => setAddOpen(true)}
                >
                  <Icon icon="lucide:plus" size={13} />
                  Add a source
                </Button>
              )}

              {addOpen ? (
                <div className="space-y-3 rounded-xl border border-dose-divider p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor={sourceInputId}>
                        DOI, PubMed ID, ISBN, URL, or title
                      </Label>
                      <Input
                        id={sourceInputId}
                        inputSize="sm"
                        value={source}
                        placeholder="10.1000/example, PMID: 12345, or a source title"
                        onChange={(event) => setSource(event.target.value)}
                        // Blur, not every keystroke: the lookup is a network
                        // call to a public API, and a reviewer pasting a DOI is
                        // done typing when they leave the field.
                        onBlur={() => void lookUpMetadata()}
                      />
                    </div>
                    <Button
                      variant="iconClose"
                      size="auto"
                      className="mt-6 shrink-0"
                      onClick={() => {
                        setAddOpen(false);
                        setAddError(null);
                        setAddedNotice(null);
                      }}
                      title="Close the add-a-source form"
                      aria-label="Close the add-a-source form"
                    >
                      <Icon icon="lucide:x" size={15} />
                    </Button>
                  </div>

                  {detection ? (
                    <div className="space-y-1">
                      <Label htmlFor={titleInputId}>Title</Label>
                      <Input
                        id={titleInputId}
                        inputSize="sm"
                        value={draftTitle}
                        placeholder="Article or source title"
                        onChange={(event) => setDraftTitle(event.target.value)}
                      />
                    </div>
                  ) : null}

                  {phase === "looking-up" ? (
                    <p className="theme-text-faint text-xs" role="status">
                      Looking up metadata…
                    </p>
                  ) : null}

                  {previewReference ? (
                    <div className="space-y-1.5">
                      <p className="theme-text-faint text-[11px] uppercase tracking-wide">
                        {existingReference ? "Already saved as" : "Will be saved as"}
                      </p>
                      <p className="theme-text-secondary text-sm leading-snug">
                        {referenceText(previewReference)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="tracking-normal">
                          {previewReference.id}
                        </Badge>
                        <Badge variant="outline" className="tracking-normal">
                          {previewReference.supportStatus === "needs_review" ? "needs review" : "existing"}
                        </Badge>
                      </div>
                    </div>
                  ) : null}

                  {addError ? (
                    <Alert variant="destructive" className="p-3 text-xs">
                      {addError}
                    </Alert>
                  ) : null}

                  {addedNotice ? (
                    <p className="theme-text-muted text-xs" role="status">
                      {addedNotice}
                    </p>
                  ) : null}

                  <Button
                    size="sm"
                    onClick={() => void saveReference()}
                    disabled={!draftReference || alreadyPresent || phase !== "idle"}
                  >
                    {phase === "saving" ? "Saving…" : "Save source"}
                  </Button>

                  {/* The marker sits next to the notice rather than only in
                      the list below: a reviewer who just pasted a duplicate
                      wants that source's token, and hunting the list for the
                      id they were handed as text is the long way round. */}
                  {existingReference ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="theme-text-muted text-xs" role="status">
                        This article already lists that source as {existingReference.id}.
                      </p>
                      {copyButton(existingReference.id)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {isEmpty ? (
            <p className="theme-text-faint text-sm">
              This article has no structured references yet. Add one above, or
              from the Editor view&rsquo;s &ldquo;Add a reference&rdquo; card,
              then place its marker with an inline edit.
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

          {uncitedEntries.length > 0 ? (
            <div className="space-y-2">
              <p className="theme-text-faint text-[11px] uppercase tracking-wide">
                Uncited — invisible on the public page until a marker cites them
              </p>
              <ul className="space-y-2">
                {uncitedEntries.map((reference) => (
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
