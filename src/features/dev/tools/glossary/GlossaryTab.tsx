"use client";

/**
 * Glossary: `/dev/glossary`. The reviewed term list every locale mirror's
 * prompts are held to, one row per (locale, term) in Postgres.
 *
 * The workflow for a locale: draft the missing terms by machine, review each
 * one (save a proposed rendering as a draft, then approve that exact revision),
 * then start the main translation once nothing is left unreviewed. Afterwards,
 * editing any rendering and pressing "Retranslate" redoes only the stored
 * translations that mention the edited terms; the background job does the
 * rest. Only approved rows reach a prompt, so an unreviewed row changes nothing
 * on the mirror until someone approves it.
 *
 * A single-row write locks only its own row, so a reviewer can keep typing in
 * the next one; after the reload, focus moves to the next unreviewed row so
 * the reviewer can continue through the list with explicit approval buttons.
 *
 * Under each term sits its definition (gloss): the one-line English meaning
 * the prompt injects beside the approved rendering and the public /glossary
 * page shows. Definitions are locale-independent taxonomy content, so an
 * editor writes them in place here and a translator reads them.
 */

import { GlossaryReaderFeedback } from "./GlossaryReaderFeedback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorSelect,
  LoadErrorState,
  useConfirm,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import {
  approveTerms,
  confirmTerms,
  count,
  DEFAULT_FILTERS,
  draftMissingTerms,
  editTerm,
  fetchGlossary,
  filterRows,
  groupRows,
  isLiveUnchecked,
  needsReview,
  reviewCounts,
  GlossaryReviewCollision,
  importGlossaryCsv,
  retranslateTerms,
  retryExhaustedPages,
  saveGloss,
  startMainTranslation,
  STATE_WORD,
  type GlossaryFilters,
  type GlossaryList,
  type GlossaryRow,
} from "./glossaryModel";
import { GlossaryCollisionDialog } from "./GlossaryCollisionDialog";
import { GlossaryGroupSection } from "./GlossaryReviewTable";
import { GlossaryActionBar, GlossaryFilterBar } from "./GlossaryToolbar";
import { PendingTermsList } from "./PendingTermsList";
import { UiTranslationWorkbench, type UiEditDrafts } from "./UiTranslationWorkbench";
import { TranslationChanges } from "./TranslationChanges";
import { NarrativeReview } from "./NarrativeReview";
import { ReviewInbox } from "./ReviewInbox";
import { parseWorkbenchDeepLink } from "../../../../../lib/translation/reviewInboxTypes";
import { TranslationCoverage } from "./TranslationCoverage";
import { TranslationProgress } from "./TranslationProgress";
import { ReasonKindChips } from "./CorrectionReason";
import type { CorrectionReasonKind, ReviewReason } from "@lib/translation/reviewReason";

/** Writes that lock the whole tab: everything but a single row's approve or save. */
type Busy = "load" | "approve" | "confirm" | "draft" | "retranslate" | "start" | "retry" | "import" | null;

/** The one row a single-row write is locking, and which of its two editable fields is being written. */
type Writing = { term: string; field: "rendering" | "definition" };

/** Where focus goes after a single-row write: the terms in document order at the time of the write, and the written row's place in them. */
type Handoff = { order: string[]; index: number };

type CollisionReview = {
  locale: string;
  error: GlossaryReviewCollision;
  kind: Exclude<Busy, null>;
  action: (collisionConfirmation?: string) => Promise<string>;
  term?: string;
};

type GlossaryTabProps = {
  /** Drafting, retranslating, and the main translation call the model, so they are admin-only; definitions are editor and up; everything else is open to a translator. */
  viewerRole: AppRole | null;
};

export function GlossaryTab({ viewerRole }: GlossaryTabProps) {
  const [view, setView] = useState("glossary");
  const [visitedViews, setVisitedViews] = useState({ inbox: false, labels: false, coverage: false, changes: false, narrative: false });
  /** A UI label deep link (from the Inbox) opens the labels view searched to that label. */
  const [labelSearch, setLabelSearch] = useState("");
  useEffect(() => {
    const link = parseWorkbenchDeepLink(window.location.search);
    if (!link) return;
    setView(link.view);
    if (link.view !== "glossary") setVisitedViews((visited) => ({ ...visited, [link.view]: true }));
    if (link.term) setFilters({ status: "all", search: link.term });
    if (link.label) setLabelSearch(link.label);
    if (link.view !== "narrative") return;
    const requestedLocale = new URLSearchParams(window.location.search).get("translationLocale");
    if (requestedLocale) setLocale(requestedLocale);
  }, []);
  const uiEditDrafts = useRef<UiEditDrafts>(new Map());
  const canAdmin = roleMeetsFloor(viewerRole, "admin");
  const canDefine = roleMeetsFloor(viewerRole, "editor");
  const [locale, setLocale] = useState<string | null>(null);
  const [data, setData] = useState<GlossaryList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const refreshInFlight = useRef(false);
  const [filters, setFilters] = useState<GlossaryFilters>(DEFAULT_FILTERS);
  const [busy, setBusy] = useState<Busy>(null);
  /** The one row an approve or save is writing; every other row stays editable. */
  const [writing, setWriting] = useState<Writing | null>(null);
  const writingTerm = writing?.term ?? null;
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const handoff = useRef<Handoff | null>(null);
  const [collisionReview, setCollisionReview] = useState<CollisionReview | null>(null);
  const collisionReturnFocus = useRef<HTMLElement | null>(null);
  const actionVersion = useRef(0);
  /** What "Retranslate" sends: derived on the server from review and retranslate stamps, so it is the same list after a reload or on another machine. */
  const pending = data?.pending ?? [];
  const { confirm, dialog } = useConfirm();
  /** Recorded in review history with every approval and confirmation made from this view. */
  const [approvalKind, setApprovalKind] = useState<CorrectionReasonKind>("terminology");
  const approvalReason: ReviewReason = { kind: approvalKind, note: "" };
  const locked = busy !== null || writingTerm !== null || collisionReview !== null;

  const load = useCallback(async (code: string | null, background = false) => {
    if (background && refreshInFlight.current) return;
    const version = ++loadVersion.current;
    if (background) refreshInFlight.current = true;
    setLoadError(null);
    try {
      const next = await fetchGlossary(code, !background);
      if (version !== loadVersion.current) return;
      setRefreshError(null);
      setData((current) => background && current ? { ...next, usages: current.usages } : next);
      setLocale(next.locale);
    } catch (error) {
      if (version !== loadVersion.current) return;
      if (background) {
        setRefreshError(error instanceof Error ? error.message : "Unable to refresh progress.");
        return;
      }
      setData(null);
      setLoadError(error instanceof Error ? error.message : "Unable to load the glossary.");
    } finally {
      if (background) refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load(new URL(window.location.href).searchParams.get("locale"));
  }, [load]);

  useEffect(() => {
    if (!data || data.jobs.active === 0 || locked) return;
    const timer = window.setInterval(() => void load(data.locale, true), 5000);
    return () => window.clearInterval(timer);
  }, [data, load, locked]);

  // Runs once the written row is unlocked and the reload has rendered: the
  // next unreviewed row after the written one takes focus, or the written row
  // itself if nothing follows it, so a reviewer never reaches for the mouse.
  useEffect(() => {
    if (writingTerm !== null || !handoff.current) return;
    const { order, index } = handoff.current;
    handoff.current = null;
    const rows: Record<string, HTMLElement> = {};
    for (const row of document.querySelectorAll<HTMLElement>("tr[data-term]")) rows[row.dataset.term ?? ""] = row;
    const next = order.slice(index + 1).find((term) => rows[term]?.dataset.needsReview === "true");
    rows[next ?? order[index]]?.querySelector("input")?.focus();
  }, [writingTerm]);

  const rows = useMemo(() => (data ? filterRows(data.rows, filters) : []), [data, filters]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  // Header numerics come from the unfiltered rows, so "34 of 120 unreviewed"
  // keeps meaning the same thing while a search narrows what is listed below.
  const totals = useMemo(() => {
    const byCategory: Record<string, { total: number; draft: number; unchecked: number }> = {};
    if (data) for (const group of groupRows(data.rows)) byCategory[group.category.id] = { total: group.rows.length, draft: group.draftCount, unchecked: group.uncheckedCount };
    return byCategory;
  }, [data]);
  const counts = reviewCounts(data?.rows ?? []);
  const draftCount = data ? data.rows.filter(needsReview).length : 0;
  const shownDrafts = rows.filter((row) => row.status === "draft");
  const shownUnchecked = rows.filter(isLiveUnchecked);
  const reviewComplete = !!data && data.rows.length > 0 && draftCount === 0;
  const nothingTranslatedYet = !!data && data.segments.total === 0;
  const canRetranslate = pending.length > 0 && !nothingTranslatedYet;
  // Collapsed is the exception, so it is what gets remembered: a group starts
  // open, and a reviewer folds away the ones they are done with. The set
  // survives filter changes and a reload of the same locale, and resets with
  // the locale, because another mirror's review is another job.
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});
  const toggleGroup = (id: string) =>
    setCollapsed((current) => {
      const next = { ...current };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });

  /** Runs one write, reloads the locale, and reports the outcome; with a term, only that row locks and focus moves on afterwards. */
  const run = useCallback(
    async (kind: Exclude<Busy, null>, action: (collisionConfirmation?: string) => Promise<string>, term?: string, collisionConfirmation?: string) => {
      if (!locale) return;
      const version = ++actionVersion.current;
      setCollisionReview(null);
      if (!collisionConfirmation) collisionReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (term) setWriting({ term, field: "rendering" }); else setBusy(kind);
      setNotice(null);
      try {
        const order = Array.from(document.querySelectorAll<HTMLElement>("tr[data-term]"), (row) => row.dataset.term ?? "");
        const message = await action(collisionConfirmation);
        await load(locale);
        if (term) handoff.current = { order, index: order.indexOf(term) };
        setNotice({ tone: "success", message });
      } catch (error) {
        if (version !== actionVersion.current) return;
        if (error instanceof GlossaryReviewCollision) {
          setCollisionReview({ locale, error, kind, action, term });
        } else {
          setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The change did not go through." });
        }
      } finally {
        if (term) setWriting(null); else setBusy(null);
      }
    },
    [load, locale],
  );

  const approveOne = (row: GlossaryRow) =>
    run("approve", async (collisionConfirmation) => {
      await approveTerms(locale!, [row.term], collisionConfirmation, { [row.term]: row.revision }, approvalReason);
      return `Approved "${row.term}".`;
    }, row.term);

  const approveMany = (terms: readonly string[]) =>
    run("approve", async (collisionConfirmation) => {
      const approved = await approveTerms(locale!, terms, collisionConfirmation, Object.fromEntries((data?.rows ?? []).filter((row) => terms.includes(row.term)).map((row) => [row.term, row.revision])), approvalReason);
      return `Approved ${count(approved.length, "term")}.`;
    });

  const approveShown = () => confirmApprove(shownDrafts.map((row) => row.term), "shown");

  /** The category header's action: the confirm names the group so a stray click cannot approve the wrong hundred terms. */
  const confirmApprove = (terms: readonly string[], where: string) => {
    confirm({
      title: `Approve the ${count(terms.length, `${STATE_WORD.draft} term`)} ${where === "shown" ? "shown" : `in ${where}`}?`,
      description: "Each rendering is approved as it stands and will be used wherever the term appears. Rows already approved are unchanged.",
      confirmLabel: where === "shown" ? "Approve all shown" : `Approve ${where}`,
      affected: [...terms],
      onConfirm: () => void approveMany(terms),
    });
  };

  const revisionsOf = (terms: readonly string[]) =>
    Object.fromEntries((data?.rows ?? []).filter((row) => terms.includes(row.term)).map((row) => [row.term, row.revision]));

  /** Records a person's check of live wording exactly as readers see it; nothing on the site changes. */
  const confirmOne = (row: GlossaryRow) =>
    run("confirm", async (collisionConfirmation) => {
      await confirmTerms(locale!, [row.term], { [row.term]: row.revision }, collisionConfirmation, approvalReason);
      return `Confirmed "${row.term}".`;
    }, row.term);

  const confirmMany = (terms: readonly string[]) =>
    run("confirm", async (collisionConfirmation) => {
      const confirmed = await confirmTerms(locale!, terms, revisionsOf(terms), collisionConfirmation, approvalReason);
      return `Confirmed ${count(confirmed.length, "term")}.`;
    });

  /** Bulk confirm always names the exact number it will record, and the terms, before anything is written. */
  const confirmLive = (terms: readonly string[], where: string) => {
    confirm({
      title: `Confirm the ${count(terms.length, "live, never checked term")} ${where === "shown" ? "shown" : `in ${where}`}?`,
      description: "Each rendering is recorded as checked by you, exactly as readers see it now. The wording on the site does not change. Edit any you disagree with instead.",
      confirmLabel: where === "shown" ? "Confirm all shown" : `Confirm ${where}`,
      affected: [...terms],
      onConfirm: () => void confirmMany(terms),
    });
  };

  const saveTarget = (row: GlossaryRow, target: string) =>
    run("approve", async (collisionConfirmation) => {
      const saved = await editTerm(locale!, row.term, target, collisionConfirmation, row.revision);
      return `Saved "${saved.term}" as ${saved.target}; awaiting approval.`;
    }, row.term);

  /** Locks the row like a rendering save, but the definition is locale-independent, so the map updates in place and nothing reloads. */
  const saveDefinition = async (row: GlossaryRow, gloss: string) => {
    ++actionVersion.current;
    setCollisionReview(null);
    setWriting({ term: row.term, field: "definition" });
    setNotice(null);
    try {
      const saved = await saveGloss(row.term, gloss);
      setData((current) => current && { ...current, glosses: { ...current.glosses, [saved.term]: saved.gloss } });
      setNotice({ tone: "success", message: `Saved the definition of "${saved.term}".` });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The definition was not saved." });
    } finally {
      setWriting(null);
    }
  };

  const retranslate = () => {
    const terms = [...pending];
    confirm({
      title: `Retranslate everything that mentions ${count(terms.length, "term")}?`,
      description: "Request background updates for translations that mention these terms. Use Coverage to track processing; publication is verified separately.",
      confirmLabel: "Retranslate",
      affected: terms,
      onConfirm: () =>
        void run("retranslate", async () => {
          const result = await retranslateTerms(locale!, terms);
          const pages = Object.values(result.jobs).reduce((sum, n) => sum + n, 0);
          return `Queued ${count(result.segments, "translation")} across ${count(pages, "page")}.`;
        }),
    });
  };

  const draft = () =>
    confirm({
      title: `Draft the missing terms for ${locale}?`,
      description: `Every term the site publishes that this locale has no row for is rendered by the model and added as ${STATE_WORD.draft}. Existing rows are never touched. This calls the model a few hundred times for a new locale.`,
      confirmLabel: "Draft missing terms",
      onConfirm: () =>
        void run("draft", async () => {
          const summary = await draftMissingTerms(locale!);
          setFilters((current) => ({ ...current, status: "draft" }));
          const caveats = [
            summary.flagged > 0 ? `${summary.flagged} need a closer look` : null,
            summary.shared > 0 ? `${summary.shared} share a rendering with another term` : null,
            summary.failed > 0 ? `${summary.failed} could not be drafted` : null,
          ].filter((part): part is string => part !== null);
          return `Drafted ${count(summary.drafted, "term")} for review${caveats.length > 0 ? `; ${caveats.join(", ")}` : ""}.`;
        }),
    });

  const startMain = () =>
    confirm({
      title: `Start the main translation for ${locale}?`,
      description: "Every public page will be translated in the background through one shared pool capped at 100 simultaneous GLM 5.3 Flash requests.",
      confirmLabel: "Start translation",
      onConfirm: () =>
        void run("start", async () => {
          const result = await startMainTranslation(locale!);
          return `Queued ${count(result.total, "page")} for translation.`;
        }),
    });

  const retryExhausted = () => {
    const pages = data?.jobs.exhausted ?? 0;
    confirm({
      title: `Retry ${count(pages, "failed page")} for ${locale}?`,
      description: "Pages in the latest run that stopped after repeated failures get a fresh set of attempts in the same run. Finished pages and saved translations are untouched.",
      confirmLabel: "Retry failed pages",
      onConfirm: () =>
        void run("retry", async () => `Queued ${count(await retryExhaustedPages(locale!), "page")} for another attempt.`),
    });
  };

  /** Reads the chosen file here and sends it whole; the server writes all of it or none. */
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const csv = file.text();
    await run("import", async (collisionConfirmation) => {
      const summary = await importGlossaryCsv(locale!, await csv, collisionConfirmation);
      return `Imported ${count(summary.drafts, "draft")}; each requires explicit approval.`;
    });
  };

  const changeLocale = (code: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("locale", code);
    window.history.replaceState(window.history.state, "", url);
    setRefreshError(null);
    ++actionVersion.current;
    setCollisionReview(null);
    setLocale(code);
    setFilters(DEFAULT_FILTERS);
    setCollapsed({});
    setData(null);
    void load(code);
  };

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:book-a"
        title="Translation workbench"
        description="Review terminology, set exact UI wording, and check translation coverage. Saving a draft and approving it are separate actions."
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => void load(locale)} disabled={locked}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Refresh
          </Button>
        }
      >
        {notice ? <EditorNotice notice={notice} /> : null}

        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => void load(locale)} />
        ) : data === null ? (
          <StateCard loading compact title="Loading glossary" />
        ) : (
          <div className="space-y-4">
            <TranslationProgress data={data} starting={busy === "start"} error={refreshError} onRefresh={() => void load(data.locale, true)}
              onRetryExhausted={canAdmin ? retryExhausted : undefined} retryDisabled={locked} />
            <GlossaryReaderFeedback key={data.locale} locale={data.locale} />
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full md:w-56">
                <EditorSelect
                  aria-label="Locale"
                  selectSize="sm"
                  value={data.locale}
                  options={data.locales.map((option) => ({
                    value: option.locale,
                    label: `${option.locale}${option.live ? " (live)" : ""} · ${option.draft} ${STATE_WORD.draft}, ${option.approved} ${STATE_WORD.approved}`,
                  }))}
                  disabled={locked}
                  onChange={(event) => changeLocale(event.target.value)}
                />
              </div>
              <EditorSegmentedControl label="Workbench view" value={view} onChange={(next) => { setView(next); if (next === "inbox" || next === "labels" || next === "coverage" || next === "changes") setVisitedViews((current) => ({ ...current, [next]: true })); }} options={[
                { value: "inbox", label: "Inbox", disabled: locked },
                { value: "glossary", label: "Glossary", disabled: locked },
                { value: "labels", label: "UI labels", disabled: locked },
                { value: "coverage", label: "Coverage", disabled: locked },
                { value: "changes", label: "Changes", disabled: locked },
                { value: "narrative", label: "Narratives", disabled: locked },
              ]} />
            </div>
            {visitedViews.inbox ? <div hidden={view !== "inbox"}><ReviewInbox key={data.locale} locale={data.locale} /></div> : null}
            {visitedViews.labels ? <div hidden={view !== "labels"}><UiTranslationWorkbench key={data.locale} locale={data.locale} editDrafts={uiEditDrafts.current} initialSearch={labelSearch} /></div> : null}
            {visitedViews.coverage ? <div hidden={view !== "coverage"}><TranslationCoverage key={data.locale} locale={data.locale} /></div> : null}
            {visitedViews.narrative ? <div hidden={view !== "narrative"}><NarrativeReview key={data.locale} locale={data.locale} canAdmin={canAdmin} /></div> : null}
            {visitedViews.changes ? <div hidden={view !== "changes"}><TranslationChanges key={data.locale} locale={data.locale} /></div> : null}
            <div hidden={view !== "glossary"} className="space-y-4">
            <GlossaryFilterBar
              filters={filters}
              setFilters={setFilters}
              draftCount={counts.drafts}
              uncheckedCount={counts.unchecked}
              shownDraftCount={shownDrafts.length}
              shownUncheckedCount={shownUnchecked.length}
              locked={locked}
              onApproveShown={approveShown}
              onConfirmShown={() => confirmLive(shownUnchecked.map((row) => row.term), "shown")}
            />

            <p className="theme-text-faint text-xs" data-testid="glossary-summary">
              {count(counts.drafts, "draft")}, {counts.unchecked} live never checked, {counts.approved} human approved · {data.segments.current} of {count(data.segments.total, "stored translation")} {data.segments.total === 1 ? "follows" : "follow"} the current terms
            </p>

            <ReasonKindChips label="Approval reason" value={approvalKind} disabled={locked} onChange={setApprovalKind} />

            <GlossaryActionBar
              locale={data.locale}
              locked={locked}
              canAdmin={canAdmin}
              nothingTranslatedYet={nothingTranslatedYet}
              pendingCount={pending.length}
              jobsActive={data.jobs.active}
              activity={busy ? BUSY_LABEL[busy] : writing ? (writing.field === "definition" ? "Saving definition" : `Saving "${writing.term}"`) : null}
              onImport={(file) => void importFile(file)}
              onDraft={draft}
              onRetranslate={retranslate}
            />
            {canDefine ? (
              <p className="theme-text-faint text-xs">
                Definitions tell the translator and the model what each term means on this site; edit one by clicking it.
              </p>
            ) : null}
            {canRetranslate ? <PendingTermsList terms={pending} /> : null}

            {reviewComplete ? (
              <StateCard
                tone={canRetranslate ? "warning" : "success"}
                icon={canRetranslate ? "lucide:languages" : "lucide:check-check"}
                title={`All ${count(data.rows.length, "term")} for ${data.locale} are reviewed`}
                description={nothingTranslatedYet
                  ? "Nothing has been translated under these terms yet. Starting the main translation uses the shared worker pool, capped at 100 simultaneous GLM 5.3 Flash requests."
                  : pending.length > 0
                    ? `${count(pending.length, "approved rendering")} ${pending.length === 1 ? "has" : "have"} not been queued for propagation yet. Retranslating redoes only the translations that mention ${pending.length === 1 ? "it" : "them"}.`
                    : "No reviewed term changes are waiting to be requested. Use Coverage to check stored content and processing; public publication is verified separately."}
                compact
                actions={!canAdmin ? undefined : canRetranslate ? (
                  <Button type="button" variant="accent" size="sm" disabled={locked || data.jobs.active > 0} onClick={retranslate}>
                    <Icon icon="lucide:languages" size={14} />
                    Retranslate
                  </Button>
                ) : (
                  <Button type="button" variant={nothingTranslatedYet ? "accent" : "outline"} size="sm" disabled={locked || data.jobs.active > 0} onClick={startMain}>
                    <Icon icon="lucide:play" size={14} />
                    {data.jobs.active > 0 ? "Translation running" : nothingTranslatedYet ? "Start main translation" : "Run the main translation again"}
                  </Button>
                )}
              />
            ) : data.rows.length > 0 ? (
              <p className="theme-text-faint text-xs">
                The main translation can start once every term is reviewed: {count(draftCount, "term")} still {draftCount === 1 ? "needs" : "need"} a decision.
              </p>
            ) : null}

            {rows.length === 0 && !reviewComplete ? (
              <StateCard
                tone="neutral"
                icon="lucide:book-a"
                title={data.rows.length === 0 ? "No terms yet" : "Nothing matches these filters"}
                description={data.rows.length === 0
                  ? canAdmin ? "Draft the missing terms or import a CSV to begin the review." : "Import a CSV, or ask an admin to draft the missing terms, to begin the review."
                  : "Widen the status or search filter."}
                compact
              />
            ) : rows.length === 0 ? null : (
              <div className="space-y-3" data-testid="glossary-groups">
                {groups.map((group) => (
                  <GlossaryGroupSection
                    key={group.category.id}
                    group={group}
                    totals={totals[group.category.id] ?? { total: group.rows.length, draft: group.draftCount, unchecked: group.uncheckedCount }}
                    statusFilter={filters.status}
                    expanded={!collapsed[group.category.id]}
                    disabled={busy !== null}
                    writingTerm={writingTerm}
                    glosses={data.glosses}
                    usages={data.usages ?? {}}
                    canDefine={canDefine}
                    onToggle={() => toggleGroup(group.category.id)}
                    onApproveAll={() => confirmApprove(group.rows.filter((row) => row.status === "draft").map((row) => row.term), group.category.label)}
                    onConfirmAll={() => confirmLive(group.rows.filter(isLiveUnchecked).map((row) => row.term), group.category.label)}
                    onApprove={(row) => void approveOne(row)}
                    onConfirm={(row) => void confirmOne(row)}
                    onSave={saveTarget}
                    onSaveDefinition={(row, gloss) => void saveDefinition(row, gloss)}
                    onRestored={() => load(locale)}
                  />
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </EditorSection>

      {dialog}
      <GlossaryCollisionDialog
        review={collisionReview}
        returnFocus={collisionReturnFocus}
        onCancel={() => setCollisionReview(null)}
        onAllow={() => {
          if (!collisionReview || collisionReview.locale !== locale) return;
          const review = collisionReview;
          setCollisionReview(null);
          void run(review.kind, review.action, review.term, review.error.collisionConfirmation);
        }}
      />
    </div>
  );
}

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  load: "Loading",
  approve: "Approving",
  confirm: "Confirming",
  draft: "Drafting with the model",
  retranslate: "Queueing the retranslation",
  start: "Queueing every page",
  retry: "Queueing the failed pages",
  import: "Importing the file",
};
