"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SearchManifestIndex } from "@/data/builders/searchManifest";
import { EditorPanel, EditorStatusPill, Notice, useUnsavedWork, type EditorStatusPillTone } from "@/features/dev/components";
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
import { When } from "./workbenchParts";

type Packet = Awaited<ReturnType<typeof readNarrativeReview>>;

type Row = Packet["rows"][number];

/** One mark per paragraph; the workbench legend owns the wider definitions. */
const MARKS: Record<
  NarrativeRowStatus,
  { label: string; tone: EditorStatusPillTone }
> = {
  unreviewed: { label: "Machine", tone: "neutral" },
  draft: { label: "Draft", tone: "warning" },
  approved: { label: "Human approved", tone: "success" },
  // A re-check approval still shows, but a neighbouring English sentence changed.
  recheck: { label: "Re-check: nearby English changed", tone: "warning" },
  stale: { label: "Source changed", tone: "danger" },
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
    <div className="relative w-full space-y-1">
      <label htmlFor={`${id}-query`} className="theme-text-secondary block text-sm font-medium">Find article</label>
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
        placeholder="English or translated title"
        inputSize="sm"
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
          className="theme-frosted-control absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-[var(--theme-border-subtle)] p-1 shadow-[var(--theme-elevation-overlay)]"
        >
          {matches.map((m, index) => (
            // The combobox owns keyboard selection through aria-activedescendant.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={m.slug}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className={`theme-menu-row cursor-pointer rounded-control px-2 py-1.5 hover:bg-[var(--theme-frosted-control-hover-bg)] ${index === active ? "bg-[var(--theme-frosted-control-bg)]" : ""}`}
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
          "Approved, but the public page may not show it yet. A reload is not proof that it is live; ask an admin to publish it again.",
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
  const blocked = Boolean(row) && ((changed && !reason.kind) || openConflicts(row!.source, target, row!.glossary, exceptionsFor(reason, row!.id)).length > 0);
  const editor = row ? (
    <div className="min-w-0 space-y-4 rounded-card border border-[color:var(--editor-panel-border-strong)] bg-[var(--editor-panel-bg-subtle)] p-4 [&_:is(input,textarea,button)]:scroll-mb-40 [&_:is(input,textarea,button)]:scroll-mt-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="theme-text-primary flex flex-wrap items-center gap-2 font-medium">
          <span>Correcting {fieldName(row.field)}</span>
          <ParagraphMark status={row.status} />
        </h4>
        <Button size="sm" variant="ghost" className="-mr-2" disabled={busy} onClick={closeEditor} aria-keyshortcuts="Escape">
          Close editor
        </Button>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
        <dt className="theme-text-muted">Machine wording</dt>
        <dd lang={locale} dir="auto" className="theme-text-secondary break-words" title={`Model ${row.machine?.model ?? "unknown"} · prompt ${row.machine?.prompt_version ?? "unknown"}`}>
          {row.machine?.target ?? <span lang="en" className="theme-text-faint">Missing</span>}
        </dd>
        <dt className="theme-text-muted">Approved wording</dt>
        <dd lang={row.approved ? locale : undefined} dir="auto" className="theme-text-secondary break-words">{row.approved?.target ?? <span lang="en" className="theme-text-faint">Not reviewed</span>}</dd>
        <dt className="theme-text-muted">Changes</dt>
        <dd className="theme-text-secondary">
          This paragraph only.{" "}
          {row.usages
            ? `The same English appears in ${count(row.usages.total, "place")}; each keeps its own wording.`
            : "Other places with the same English were not checked."}
          {row.usages?.pages.length ? (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {row.usages.pages.map((p) => (
                <li key={`${p.kind}:${p.slug}`}>
                  <a className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline" href={p.href} target="_blank" rel="noopener noreferrer">
                    {p.label}<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </dd>
      </dl>
      <label htmlFor={`${formId}-correction`} className="block space-y-1">
        <span className="theme-text-secondary text-sm font-medium">Correction</span>
        <Textarea
          id={`${formId}-correction`}
          ref={correctionRef}
          lang={locale}
          dir="auto"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) {
              e.preventDefault();
              closeEditor();
            }
          }}
          disabled={busy}
          maxLength={30000}
          className="[field-sizing:content] max-h-[70vh] min-h-24 text-[16px] md:text-sm"
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ApprovalActions
          changed={changed}
          canSave={canSave}
          approvable={approvable}
          busy={busy}
          blocked={blocked}
          onSave={() => void mutate("save")}
          onSaveAndApprove={() => void mutate("save-approve")}
          onApprove={() => void mutate("approve")}
        />
        <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs">
          {target !== openedTarget ? <><span aria-hidden className="size-1.5 rounded-full bg-[var(--theme-accent)]" />Unsaved correction</> : busy ? "Saving" : null}
        </span>
      </div>
      {error ? <Notice tone="danger" placement="inline" message={error} dismiss={() => setError(null)} /> : null}
      {notice ? <p role="status" className="text-sm text-[color:var(--theme-success-text)]">{notice}</p> : null}
      <Receipts publication={publication} />
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
          <ul className="theme-dev-link-list" aria-label="Review history">
            {history.map((h) => (
              <li key={h.revision} className="theme-text-secondary space-y-1.5 py-2 text-sm">
                <p>
                  Revision {h.revision}: {h.action} by {h.actor}, <When at={h.createdAt} />.{" "}
                  {formatReviewReason(h.reason)}
                  {h.glossaryExceptions?.length
                    ? ` Kept out on purpose: ${h.glossaryExceptions.join(", ")}.`
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  ) : null;
  const openByAddress = (
      <details className="theme-text-muted text-sm" open={Boolean(slug) || undefined}>
              <summary className="cursor-pointer select-none text-xs">Open by address instead</summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label htmlFor={`${formId}-slug`} className="min-w-0 flex-1 space-y-1">
                  <span className="theme-text-secondary block text-xs font-medium">Article slug</span>
                  <Input
                    id={`${formId}-slug`}
                    inputSize="sm"
                    value={slug}
                    disabled={busy}
                    placeholder="lsd"
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setPacket(null);
                      setHistory([]);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && slug.trim() && !busy) {
                        e.preventDefault();
                        void load();
                      }
                    }}
                  />
                </label>
                <Button variant="outline" size="sm" disabled={busy || !slug.trim()} onClick={() => void load()}>
                  Open article
                </Button>
              </div>
            </details>
  );
  const approvedShare = packet?.tally ? (packet.tally.total ? (packet.tally.humanApproved / packet.tally.total) * 100 : 0) : 0;
  return (
    <section aria-label="Narrative review" className="min-w-0 space-y-4">
      {packet ? null : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
          <div className="min-w-0 space-y-2">
            <ArticlesToReview locale={locale} disabled={busy} onOpen={choose} />
          </div>
          <div className="min-w-0 space-y-3 lg:sticky lg:top-24">
            <p className="theme-text-secondary text-sm">
              Or open any article. A correction changes only the paragraph you choose; the same English elsewhere keeps its own wording.
            </p>
            <ArticlePicker locale={locale} disabled={busy} onChoose={choose} />
            {openByAddress}
            {error ? <Notice tone="danger" placement="inline" message={error} dismiss={() => setError(null)} /> : null}
          </div>
        </div>
      )}
      {packet ? (
        <EditorPanel className="overflow-visible">
          <header className="theme-portal-rule space-y-3 border-b px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="-ml-2"
                disabled={busy}
                onClick={() => {
                  closeEditor();
                  setPacket(null);
                  setSlug("");
                }}
              >
                <Icon icon="lucide:arrow-left" size={14} />
                Back to articles needing review
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <details className="group relative">
                  <summary className="theme-text-secondary cursor-pointer select-none list-none text-sm hover:underline">Open another article</summary>
                  <div className="theme-portal-rule absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] space-y-3 rounded-card border bg-[var(--editor-panel-bg)] p-3 shadow-[var(--theme-elevation-overlay)]">
                    <ArticlePicker locale={locale} disabled={busy} onChoose={choose} />
                    {openByAddress}
                  </div>
                </details>
                <a href={`/substances/${packet.slug}`} target="_blank" rel="noopener noreferrer" className="text-dose-accent-strong theme-accent-underline inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
                  Open the English page
                  <Icon icon="lucide:arrow-up-right" size={13} />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 space-y-1.5">
                <h3 className="theme-accent-heading text-xl font-semibold leading-tight">{packet.slug}</h3>
                {packet.tally ? (
                  <p className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
                    <span aria-hidden className="flex h-1.5 w-24 overflow-hidden rounded-full theme-progress-track">
                      <span className="block h-full bg-[var(--theme-accent)]" style={{ width: `${approvedShare}%` }} />
                    </span>
                    <span>
                      {packet.tally.humanApproved} of {packet.tally.total} paragraphs
                      human approved
                    </span>
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
            </div>
          </header>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {!row && error ? <Notice tone="danger" placement="inline" message={error} dismiss={() => setError(null)} /> : null}
            {!row && notice ? <p role="status" className="text-sm text-[color:var(--theme-success-text)]">{notice}</p> : null}
            {!row ? <Receipts publication={publication} /> : null}
            <p className="theme-text-muted text-xs">
              Stored wording in source order. Select a translated paragraph to
              correct it.
            </p>
            <div
              aria-hidden="true"
              className="type-meta-label theme-text-muted hidden md:grid md:grid-cols-2 md:gap-6"
            >
              <span>English</span>
              <span className="normal-case tracking-normal">{languageLabel(locale)}</span>
            </div>
            <ol className="theme-dev-link-list">
              {packet.rows.map((item, index) => {
                const textId = `${formId}-text-${index}`,
                  active = item.id === selected;
                return (
                  <li key={item.id} className="min-w-0 space-y-2 py-3">
                    <p className="theme-text-faint text-xs" title={labels[index]}>{fieldName(labels[index])}</p>
                    <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 md:gap-6">
                      <div className="min-w-0">
                        <p className="theme-text-faint text-xs md:hidden">
                          English
                        </p>
                        <p
                          lang="en"
                          className="theme-text-primary whitespace-pre-wrap break-words leading-relaxed"
                        >
                          {item.source}
                        </p>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="theme-text-faint text-xs md:hidden">
                            {languageLabel(locale)}
                          </span>
                          <ParagraphMark status={item.status as NarrativeRowStatus} />
                        </div>
                        <button
                          type="button"
                          aria-label={`Review ${labels[index]}`}
                          aria-describedby={textId}
                          aria-expanded={active}
                          disabled={busy}
                          className={`theme-focus-ring group -mx-2 block w-[calc(100%+1rem)] min-w-0 rounded-control px-2 py-1 text-left transition-colors hover:bg-[var(--theme-frosted-control-hover-bg)] ${active ? "bg-[var(--theme-frosted-control-bg)]" : ""}`}
                          onClick={() => void load(item.id)}
                        >
                          <span
                            id={textId}
                            lang={locale}
                            dir="auto"
                            className="theme-text-primary whitespace-pre-wrap break-words leading-relaxed"
                          >
                            {liveText(item)}
                          </span>
                          <span aria-hidden className="theme-text-faint ml-1 inline-flex translate-y-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                            <Icon icon="lucide:pencil" size={12} />
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
          </div>
        </EditorPanel>
      ) : null}
    </section>
  );
}

/** A paragraph's review state as the sentence-case pill every view uses. */
function ParagraphMark({ status }: { status: NarrativeRowStatus }) {
  const mark = MARKS[status] ?? MARKS.unreviewed;
  return <EditorStatusPill tone={mark.tone} inline>{mark.label}</EditorStatusPill>;
}

/** "effects.summary paragraph 2" as a reader would say it: "Effects summary, paragraph 2". */
function fieldName(field: string): string {
  const spaced = field.replace(/[._-]+/g, " ").replace(/\s+paragraph\s+(\d+)$/, ", paragraph $1").replace(/\s+(\d+)$/, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Where an approval was sent after it saved; a receipt that did not land says so. */
function Receipts({ publication }: { publication: PublicationReceipt[] }) {
  if (publication.length === 0) return null;
  return (
    <ul className="theme-text-muted space-y-0.5 text-xs">
      {publication.map((receipt, index) => (
        <li key={index} className={receipt.status === "accepted" ? undefined : "text-[color:var(--theme-warning-text)]"}>
          {receipt.target}: {receipt.status} ({receipt.attempts} {receipt.attempts === 1 ? "attempt" : "attempts"}). {receipt.detail}
        </li>
      ))}
    </ul>
  );
}
