"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import type { SearchManifestIndex } from "@/data/builders/searchManifest";
import { useUnsavedWork } from "@/features/dev/components";
import { loadSearchManifestIndex } from "@/hooks/useSearchManifest";
import { parseUiLocale } from "@/i18n/messages";
import type { PublicationReceipt } from "@server/next/publicationDispatch";
import type { readNarrativeReview } from "@server/translation/narrativeReview";
import { formatReviewReason } from "@server/translation/reviewReason";
import {
  narrativeOverlayApplies,
  type NarrativeRowStatus,
  type ReviewHistoryEntry,
} from "@server/translation/reviewTypes";
import { ArticlesToReview } from "./ArticlesToReview";
import {
  ApprovalActions,
  CorrectionReasonFields,
  EMPTY_CORRECTION,
  exceptionsFor,
  openConflicts,
  reasonFor,
  type CorrectionDraft,
} from "./CorrectionReason";
import { FluencyReviewButton } from "./FluencyReviewButton";
import { count, languageLabel } from "./glossaryModel";
import { PromoteToStyleGuide } from "./StyleGuidePanel";
import { TranslatorNoteSlot, useTranslatorNotes } from "./TranslatorNotes";

type Packet = Awaited<ReturnType<typeof readNarrativeReview>>;

type Row = Packet["rows"][number];

/** One mark per paragraph; the workbench legend owns the wider definitions. */
const MARKS: Record<
  NarrativeRowStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  unreviewed: { label: "Machine", variant: "outline" },
  draft: { label: "Draft", variant: "secondary" },
  approved: { label: "Human approved", variant: "success" },
  // A re-check approval still shows, but a neighbouring English sentence changed.
  recheck: { label: "Re-check: nearby English changed", variant: "default" },
  stale: { label: "Source changed", variant: "destructive" },
};

/** Wording a reader sees now: an applied approval (including re-check), else the machine target, else English. */
function liveText(row: Row) {
  return row.approved && narrativeOverlayApplies(row.overlay)
    ? row.approved.target
    : (row.machine?.target ?? row.source);
}

/** Field labels, numbered when one field holds several paragraphs. */
function paragraphLabels(rows: readonly Row[]) {
  const counts = new Map<string, number>(),
    seen = new Map<string, number>();
  for (const r of rows) counts.set(r.field, (counts.get(r.field) ?? 0) + 1);
  return rows.map((r) => {
    const n = (seen.get(r.field) ?? 0) + 1;
    seen.set(r.field, n);
    return (counts.get(r.field) ?? 0) > 1
      ? `${r.field} paragraph ${n}`
      : r.field;
  });
}

type ArticleMatch = { slug: string; english: string; localized?: string };

const MAX_MATCHES = 12;

/** Finds published substance articles through the public search manifests, English and locale. */
function ArticlePicker({
  locale,
  disabled,
  onChoose,
}: {
  locale: string;
  disabled: boolean;
  onChoose: (slug: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false);
  const [indexes, setIndexes] = useState<{
    en: SearchManifestIndex | null;
    local: SearchManifestIndex | null;
  } | null>(null);
  const loading = useRef(false);
  const uiLocale = parseUiLocale(locale, "en");
  function ensureIndexes() {
    if (indexes || loading.current) return;
    loading.current = true;
    void Promise.all([
      loadSearchManifestIndex("en"),
      uiLocale === locale && locale !== "en"
        ? loadSearchManifestIndex(uiLocale)
        : null,
    ])
      .then(([en, local]) => setIndexes({ en, local }))
      .finally(() => {
        loading.current = false;
      });
  }
  const matches = useMemo<ArticleMatch[]>(() => {
    if (!indexes || !query.trim()) return [];
    const bySlug = new Map<string, ArticleMatch>();
    for (const s of indexes.en?.query(query, { limit: 40 }) ?? [])
      if (s.type === "substance" && !bySlug.has(s.slug))
        bySlug.set(s.slug, { slug: s.slug, english: s.label });
    for (const s of indexes.local?.query(query, { limit: 40 }) ?? []) {
      if (s.type !== "substance") continue;
      const known = bySlug.get(s.slug);
      if (known) known.localized = s.label;
      else
        bySlug.set(s.slug, {
          slug: s.slug,
          english: s.label,
          localized: s.label,
        });
    }
    return [...bySlug.values()].slice(0, MAX_MATCHES);
  }, [indexes, query]);
  const failed = indexes !== null && !indexes.en && !indexes.local;
  const [activeIndex, setActiveIndex] = useState(0);
  const expanded = open && matches.length > 0,
    active = Math.min(activeIndex, matches.length - 1);
  function pick(m: ArticleMatch) {
    setOpen(false);
    setQuery(m.english);
    onChoose(m.slug);
  }
  return (
    <div className="relative w-full max-w-md">
      <label htmlFor={`${id}-query`}>Find article</label>
      <Input
        id={`${id}-query`}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        autoComplete="off"
        value={query}
        disabled={disabled}
        placeholder="English or localized title"
        onFocus={() => {
          ensureIndexes();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          ensureIndexes();
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          else if (expanded && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setActiveIndex(
              (active + (e.key === "ArrowDown" ? 1 : matches.length - 1)) %
                matches.length,
            );
          } else if (expanded && e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]);
          }
        }}
      />
      {failed ? (
        <p className="theme-text-secondary text-sm">
          Article search is unavailable. Enter the source slug instead.
        </p>
      ) : null}
      {expanded ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Matching articles"
          className="theme-frosted-control mt-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--theme-border-subtle)] p-1"
        >
          {matches.map((m, index) => (
            // The combobox owns keyboard selection through aria-activedescendant.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={m.slug}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className={`cursor-pointer rounded-md px-2 py-1.5 hover:bg-[var(--theme-frosted-control-hover-bg)] ${index === active ? "bg-[var(--theme-frosted-control-bg)]" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
            >
              <span className="theme-text-primary">{m.english}</span>
              {m.localized && m.localized !== m.english ? (
                <span lang={locale} dir="auto" className="theme-text-secondary">
                  {" "}
                  · {m.localized}
                </span>
              ) : null}
              <span className="theme-text-faint text-xs"> · {m.slug}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function NarrativeReview({
  locale,
  canAdmin = false,
}: {
  locale: string;
  /** Shows the admin-only "Review fluency" model pass for the open article. */
  canAdmin?: boolean;
}) {
  const formId = useId();
  const kind = "article";
  const [slug, setSlug] = useState("");
  const [packet, setPacket] = useState<Packet | null>(null),
    [selected, setSelected] = useState("");
  const [target, setTarget] = useState(""),
    [reason, setReason] = useState<CorrectionDraft>(EMPTY_CORRECTION);
  /** The wording the open paragraph's editor started from; typing away from it is unsaved work. */
  const [openedTarget, setOpenedTarget] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [publication, setPublication] = useState<PublicationReceipt[]>([]);
  const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);
  /** The open paragraph's review history sits in a drawer, closed until asked for. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const correctionRef = useRef<HTMLTextAreaElement>(null);
  const row = packet?.rows.find((r) => r.id === selected);
  const labels = useMemo(() => paragraphLabels(packet?.rows ?? []), [packet]);
  const notes = useTranslatorNotes(locale, packet?.slug, packet?.sourceVersion);
  async function load(
    id?: string,
    requestedSlug = slug,
    expectedVersion = packet?.sourceVersion,
  ) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ locale, kind, slug: requestedSlug });
      if (id) params.set("history", id);
      const response = await fetch(`/api/dev/translation-narrative?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load record.");
      if (id && expectedVersion && expectedVersion !== data.sourceVersion) {
        setPacket(data);
        setSelected("");
        setHistory([]);
        throw new Error(
          "Source context changed since the preview. Inspect the refreshed text and select the field again.",
        );
      }
      setPacket(data);
      const location = new URL(window.location.href);
      location.searchParams.set("translationReview", "article");
      location.searchParams.set("translationLocale", locale);
      location.searchParams.set("translationSlug", data.slug);
      if (id) {
        location.searchParams.set("translationSegment", id);
        location.searchParams.set("translationVersion", data.sourceVersion);
      } else {
        location.searchParams.delete("translationSegment");
        location.searchParams.delete("translationVersion");
      }
      window.history.replaceState(window.history.state, "", location);
      setSelected(id ?? "");
      setHistory(data.history ?? []);
      if (id) {
        const next = data.rows.find((r: Row) => r.id === id);
        const opened =
          next?.draft?.target ??
          next?.approved?.target ??
          next?.machine?.target ??
          "";
        setTarget(opened);
        setOpenedTarget(opened);
        requestAnimationFrame(() => {
          correctionRef.current?.scrollIntoView?.({ block: "center" });
          correctionRef.current?.focus();
        });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load record.",
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(nextSlug: string) {
    setSlug(nextSlug);
    setPacket(null);
    setSelected("");
    setHistory([]);
    void load(undefined, nextSlug, undefined);
  }
  function closeEditor() {
    setSelected("");
    setHistory([]);
    const location = new URL(window.location.href);
    location.searchParams.delete("translationSegment");
    location.searchParams.delete("translationVersion");
    window.history.replaceState(window.history.state, "", location);
  }
  const openedLink = useRef(false);
  useEffect(() => {
    if (openedLink.current) return;
    openedLink.current = true;
    const params = new URLSearchParams(window.location.search);
    const requestedSlug = params.get("translationSlug");
    if (
      params.get("translationReview") !== "article" ||
      params.get("translationLocale") !== locale ||
      !requestedSlug
    )
      return;
    setSlug(requestedSlug);
    void load(
      params.get("translationSegment") ?? undefined,
      requestedSlug,
      params.get("translationVersion") ?? undefined,
    );
  }, [locale]);
  async function send(
    action: "save" | "approve" | "restore",
    expectedRevision: number,
    restoreRevision?: number,
  ) {
    if (!packet || !row) throw new Error("Choose a paragraph first.");
    const fallback =
      action === "save"
        ? "Saved the wording as it stands."
        : action === "approve"
          ? "Reviewed the saved wording in its article."
          : `Restore revision ${restoreRevision} for review.`;
    const response = await fetch("/api/dev/translation-narrative", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        kind: packet.kind,
        slug: packet.slug,
        id: row.id,
        sourceVersion: packet.sourceVersion,
        expectedRevision,
        action,
        target,
        reason: reasonFor(reason, fallback),
        glossaryExceptions:
          action === "save" ? exceptionsFor(reason, row.id) : undefined,
        restoreRevision,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to save review.");
    return result;
  }
  /** Save and approve saves the paragraph, then approves exactly the revision that save produced. */
  async function mutate(
    action: "save" | "approve" | "restore" | "save-approve",
    restoreRevision?: number,
  ) {
    if (!packet || !row) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const saved = await send(
        action === "save-approve" ? "save" : action,
        row.revision,
        restoreRevision,
      );
      const result =
        action === "save-approve"
          ? await send("approve", saved.entry?.revision ?? row.revision + 1)
          : saved;
      const approved = action === "approve" || action === "save-approve";
      setReason(EMPTY_CORRECTION);
      setPublication(result.publication ?? []);
      setNotice(
        approved
          ? "Approved for this field only."
          : "Draft saved. Published wording is unchanged.",
      );
      if (
        approved &&
        result.publication?.some(
          (receipt: { status: string }) => receipt.status !== "accepted",
        )
      )
        setNotice(
          "Approved, but cache delivery is incomplete. Reloading the public page is not proof of delivery; retain the receipt and retry publication through the operator workflow.",
        );
      await load(row.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save review.",
      );
    } finally {
      setBusy(false);
    }
  }
  // Machine wording counts as unsaved: keeping it as it stands is saving it as a person's.
  const savedTarget = row?.draft?.target ?? row?.approved?.target ?? "";
  const changed = Boolean(
    row && target.trim() && target.trim() !== savedTarget.trim(),
  );
  const approvable = Boolean(
    row?.draft &&
    !changed &&
    row.status !== "stale" &&
    row.draft.context === row.context &&
    target === row.draft.target,
  );
  const canSave =
    Boolean(target.trim()) && (changed || Boolean(row?.draft && !approvable));
  // Opening a machine paragraph is not an edit, so the shell hears only about
  // typing. A correction needs its reason and conflict checks, so the shell
  // only discards it.
  useUnsavedWork({
    id: "glossary:article-correction",
    tab: "glossary",
    label: `Glossary: correction to ${packet?.slug ?? "an article"}${row ? `, ${row.field}` : ""} in ${languageLabel(locale)}`,
    dirty: Boolean(row) && target !== openedTarget,
    discard: () => {
      setTarget(openedTarget);
      setReason(EMPTY_CORRECTION);
    },
  });
  const editor = row ? (
    <Surface
      variant="subtle"
      padding="sm"
      radius="lg"
      className="min-w-0 space-y-3 break-words"
    >
      <h4 className="theme-text-primary font-medium">
        {row.field} · {MARKS[row.status]?.label ?? row.status}
      </h4>
      <p
        className="theme-text-secondary text-sm"
        title={`Model ${row.machine?.model ?? "unknown"} · prompt ${row.machine?.prompt_version ?? "unknown"}`}
      >
        Machine translation: {row.machine?.target ?? "Missing"}
      </p>
      <p className="theme-text-secondary text-sm">
        Approved translation: {row.approved?.target ?? "Not reviewed"}
      </p>
      <p className="theme-text-secondary text-sm">
        {row.usages
          ? `The same English appears in ${count(row.usages.total, "place")}; showing ${row.usages.pages.length}.`
          : "Other places with the same English were not checked."}{" "}
        This correction changes only {packet?.slug}, {row.field}.
      </p>
      <ul className="theme-text-secondary text-sm">
        {row.usages?.pages.map((p) => (
          <li key={`${p.kind}:${p.slug}`}>
            <SmartLink className="underline" href={p.href}>
              {p.kind}: {p.label}
            </SmartLink>
          </li>
        ))}
      </ul>
      <label htmlFor={`${formId}-correction`} className="block">
        Correction
        <Textarea
          id={`${formId}-correction`}
          ref={correctionRef}
          lang={locale}
          dir="auto"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={busy}
          maxLength={30000}
        />
      </label>
      <CorrectionReasonFields
        value={reason}
        onChange={setReason}
        segment={row.id}
        source={row.source}
        target={target}
        mentions={row.glossary}
        locale={locale}
        disabled={busy}
        needed={changed}
      />
      <ApprovalActions
        changed={changed}
        canSave={canSave}
        approvable={approvable}
        busy={busy}
        blocked={
          (changed && !reason.kind) ||
          openConflicts(
            row.source,
            target,
            row.glossary,
            exceptionsFor(reason, row.id),
          ).length > 0
        }
        onSave={() => void mutate("save")}
        onSaveAndApprove={() => void mutate("save-approve")}
        onApprove={() => void mutate("approve")}
      >
        <Button size="sm" variant="ghost" disabled={busy} onClick={closeEditor}>
          Close editor
        </Button>
      </ApprovalActions>
      <ExpandButton
        variant="inline"
        className="-ml-1 text-current"
        isExpanded={historyOpen}
        ariaLabel={`History for ${row.field}`}
        onToggle={() => setHistoryOpen(!historyOpen)}
      >
        History
      </ExpandButton>
      {historyOpen ? (
        history.length === 0 ? (
          <p className="theme-text-faint text-xs">
            No recorded review history for this paragraph.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Review history">
            {history.map((h) => (
              <li key={h.revision} className="theme-text-secondary text-sm">
                Revision {h.revision}: {h.action} by {h.actor}.{" "}
                {formatReviewReason(h.reason)}
                {h.glossaryExceptions?.length
                  ? ` Kept out on purpose: ${h.glossaryExceptions.join(", ")}.`
                  : ""}{" "}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void mutate("restore", h.revision)}
                >
                  Restore as draft
                </Button>
                {h.action === "save" &&
                h.reason.kind === "fluency" &&
                packet ? (
                  <PromoteToStyleGuide
                    locale={locale}
                    slug={packet.slug}
                    segment={row.id}
                    revision={h.revision}
                    disabled={busy}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Surface>
  ) : null;
  return (
    <section aria-label="Narrative review" className="min-w-0 space-y-4">
      <p className="theme-text-secondary text-sm">
        Pick an article to review. A correction changes only the paragraph you
        chose; the same English elsewhere keeps its own wording.
      </p>
      {packet ? null : (
        <ArticlesToReview locale={locale} disabled={busy} onOpen={choose} />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <ArticlePicker locale={locale} disabled={busy} onChoose={choose} />
        <label htmlFor={`${formId}-slug`}>
          Article slug
          <Input
            id={`${formId}-slug`}
            value={slug}
            disabled={busy}
            onChange={(e) => {
              setSlug(e.target.value);
              setPacket(null);
              setHistory([]);
            }}
          />
        </label>
        <Button disabled={busy || !slug.trim()} onClick={() => void load()}>
          Open article
        </Button>
      </div>
      {error ? (
        <StateCard
          compact
          tone="danger"
          title="Review failed"
          description={error}
        />
      ) : null}
      {publication.length > 0 ? (
        <ul className="theme-text-secondary text-sm">
          {publication.map((receipt, index) => (
            <li key={index}>
              {receipt.target}: {receipt.status} ({receipt.attempts} attempts).{" "}
              {receipt.detail}
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? (
        <p role="status" className="theme-text-secondary text-sm">
          {notice}
        </p>
      ) : null}
      {packet ? (
        <Surface
          variant="subtle"
          padding="sm"
          radius="lg"
          className="min-w-0 space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="theme-text-primary font-medium">{packet.slug}</h3>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                closeEditor();
                setPacket(null);
                setSlug("");
              }}
            >
              Back to articles needing review
            </Button>
            {packet.tally ? (
              <p className="theme-text-secondary text-sm">
                {packet.tally.humanApproved} of {packet.tally.total} paragraphs
                human approved
              </p>
            ) : null}
          </div>
          {canAdmin ? (
            <FluencyReviewButton
              key={packet.slug}
              locale={locale}
              slug={packet.slug}
            />
          ) : null}
          <p className="theme-text-faint text-xs">
            Stored wording in source order. Click a translated paragraph to
            correct it.
          </p>
          <div
            aria-hidden="true"
            className="theme-text-faint hidden text-xs md:grid md:grid-cols-2 md:gap-4"
          >
            <span>English</span>
            <span>{languageLabel(locale)}</span>
          </div>
          <ol className="space-y-4">
            {packet.rows.map((item, index) => {
              const mark =
                  MARKS[item.status as NarrativeRowStatus] ?? MARKS.unreviewed,
                textId = `${formId}-text-${index}`,
                active = item.id === selected;
              return (
                <li key={item.id} className="min-w-0 space-y-2">
                  <p className="theme-text-faint text-xs">{labels[index]}</p>
                  <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
                    <div className="min-w-0">
                      <p className="theme-text-faint text-xs md:hidden">
                        English
                      </p>
                      <p
                        lang="en"
                        className="theme-text-primary whitespace-pre-wrap break-words"
                      >
                        {item.source}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="theme-text-faint text-xs md:hidden">
                          {languageLabel(locale)}
                        </span>
                        <Badge variant={mark.variant}>{mark.label}</Badge>
                      </div>
                      <button
                        type="button"
                        aria-label={`Review ${labels[index]}`}
                        aria-describedby={textId}
                        aria-expanded={active}
                        disabled={busy}
                        className={`theme-focus-ring block w-full min-w-0 rounded-md px-2 py-1 text-left hover:bg-[var(--theme-frosted-control-hover-bg)] ${active ? "bg-[var(--theme-frosted-control-bg)]" : ""}`}
                        onClick={() => void load(item.id)}
                      >
                        <span
                          id={textId}
                          lang={locale}
                          dir="auto"
                          className="theme-text-primary whitespace-pre-wrap break-words"
                        >
                          {liveText(item)}
                        </span>
                      </button>
                    </div>
                  </div>
                  {active ? editor : null}
                  <TranslatorNoteSlot state={notes} afterRowId={item.id} />
                </li>
              );
            })}
          </ol>
          <TranslatorNoteSlot state={notes} rest />
        </Surface>
      ) : null}
    </section>
  );
}
