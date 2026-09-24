"use client";

/**
 * Translation workbench: `/dev/glossary`, opening on glossary categories. Inbox lists what
 * needs a person. Words holds glossary terms and UI labels behind one search.
 * Pages holds the article reader, per-page coverage, recorded changes, and, for
 * admins, the collapsed Runs panel with every control that calls the model.
 *
 * The glossary is the reviewed term list every locale mirror's prompts are
 * held to, one row per (locale, term) in Postgres.
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
import { GlossaryGroupSection, type GlossaryEditDrafts } from "./GlossaryReviewTable";
import { GlossaryActionBar, GlossaryFilterBar } from "./GlossaryToolbar";
import { UiTranslationWorkbench, type UiEditDrafts } from "./UiTranslationWorkbench";
import { TranslationChanges } from "./TranslationChanges";
import { NarrativeReview } from "./NarrativeReview";
import { ReviewInbox } from "./ReviewInbox";
import { StyleGuidePanel } from "./StyleGuidePanel";
import { parseWorkbenchDeepLink } from "../../../../../lib/translation/reviewInboxTypes";
import type { PagesSection, WorkbenchView, WordsList } from "@lib/translation/reviewInboxTypes";
import { TranslationCoverage } from "./TranslationCoverage";
import { RunsPanel } from "./RunsPanel";
import { StatusLegend } from "./StatusLegend";
import { WorkbenchDrawer } from "./WorkbenchDrawer";
import { Input } from "@/components/ui/input";
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
  const [view, setView] = useState<WorkbenchView>("words");
  /** Views mount on first visit and then stay mounted, so switching never drops typed work. */
  const [visitedViews, setVisitedViews] = useState<Record<WorkbenchView | "labels" | "style", boolean>>({ inbox: false, words: false, pages: false, labels: false, style: false });
  const [wordsList, setWordsList] = useState<WordsList>("terms");
  /** The drawer under the article reader that a deep link asked for. */
  const [pagesSection, setPagesSection] = useState<PagesSection | null>(null);
  // Opens on glossary categories unless a deep link names a view; links written for the
  // older five views map onto these three (see parseWorkbenchDeepLink).
  useEffect(() => {
    const link = parseWorkbenchDeepLink(window.location.search) ?? { view: "words" as const };
    setView(link.view);
    setVisitedViews((visited) => ({ ...visited, [link.view]: true, labels: visited.labels || link.words === "labels", style: visited.style || link.words === "style" }));
    if (link.words) setWordsList(link.words);
    if (link.pages) setPagesSection(link.pages);
    const params = new URLSearchParams(window.location.search);
    setCategory(params.get("translationCategory"));
    const status = params.get("translationStatus");
    if (status === "all" || status === "draft" || status === "unchecked" || status === "approved") setFilters((current) => ({ ...current, status }));
    if (link.term) setFilters({ status: "all", search: link.term });
    if (link.label) setFilters((current) => ({ ...current, search: link.label ?? "" }));
    if (link.view !== "pages") return;
    const requestedLocale = new URLSearchParams(window.location.search).get("translationLocale");
    if (requestedLocale) setLocale(requestedLocale);
  }, []);
  const updateLocation = (values: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    // Legacy article links must not override an explicit view selection on reload.
    url.searchParams.delete("translationReview");
    for (const [key, value] of Object.entries(values)) {
      if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", url);
  };
  const openView = (next: WorkbenchView) => {
    updateLocation({ translationView: next });
    setView(next);
    setVisitedViews((current) => ({ ...current, [next]: true, labels: current.labels || (next === "words" && wordsList === "labels") }));
  };
  const openWordsList = (next: WordsList) => {
    setWordsList(next);
    updateLocation({ translationView: "words", translationWords: next });
    if (next === "labels" || next === "style") setVisitedViews((current) => ({ ...current, [next]: true }));
  };
  const uiEditDrafts = useRef<UiEditDrafts>(new Map());
  const termEditDrafts = useRef<GlossaryEditDrafts>(new Map());
  const [category, setCategory] = useState<string | null>(null);
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
      const next = await fetchGlossary(code, false);
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
    const params = new URL(window.location.href).searchParams;
    void load(params.get("locale") ?? params.get("translationLocale"));
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
  const workingRows = filters.search.trim() ? rows : groups.find((group) => group.category.id === category)?.rows ?? [];
  const shownDrafts = workingRows.filter((row) => row.status === "draft");
  const shownUnchecked = workingRows.filter(isLiveUnchecked);
  const reviewComplete = !!data && data.rows.length > 0 && draftCount === 0;
  const nothingTranslatedYet = !!data && data.segments.total === 0;
  const toggleGroup = (id: string) => {
    const next = category === id ? null : id;
    setCategory(next);
    updateLocation({ translationCategory: next });
  };

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
      description: "Request background updates for translations that mention these terms. Runs and Coverage in Pages track the processing.",
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
    setCategory(null);
    url.searchParams.delete("translationCategory");
    url.searchParams.delete("translationTerm");
    url.searchParams.delete("translationLabel");
    url.searchParams.delete("translationStatus");
    window.history.replaceState(window.history.state, "", url);
    setData(null);
    void load(code);
  };

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:book-a"
        title="Translation workbench"
        description="Choose a glossary category, find a term, or open UI labels and articles. Save wording as a draft, then approve it separately."
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
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full md:w-56">
                <EditorSelect
                  aria-label="Locale"
                  selectSize="sm"
                  value={data.locale}
                  options={data.locales.map((option) => ({
                    value: option.locale,
                    label: `${option.locale}${option.live ? " (live)" : ""}`,
                  }))}
                  disabled={locked}
                  onChange={(event) => changeLocale(event.target.value)}
                />
              </div>
              <EditorSegmentedControl label="Workbench view" value={view} onChange={(next) => openView(next as WorkbenchView)} options={[
                { value: "words", label: "Words", disabled: locked },
                { value: "pages", label: "Pages", disabled: locked },
                { value: "inbox", label: "Inbox", disabled: locked },
              ]} />
            </div>

            {/* The status strip: the locale's totals in one line, on every view. */}
            <p className="theme-text-faint text-xs" data-testid="glossary-summary">
              {count(counts.drafts, "draft")}, {counts.unchecked} live never checked, {counts.approved} human approved
              {view !== "words" ? ` · ${data.segments.current} of ${count(data.segments.total, "stored translation")} follow the current terms` : ""}
              {view !== "words" && runStatus(data, busy === "start") ? ` · ${runStatus(data, busy === "start")}` : ""}
              {refreshError ? ` · Progress refresh failed: ${refreshError}` : ""}
            </p>
            <StatusLegend />

            {visitedViews.inbox ? <div hidden={view !== "inbox"}><ReviewInbox key={data.locale} locale={data.locale} /></div> : null}

            <div hidden={view !== "words"} className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full md:w-80">
                  <Input
                    type="search"
                    inputSize="sm"
                    aria-label="Search words"
                    placeholder="Search terms, renderings, UI labels, or context"
                    value={filters.search}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, search: event.target.value }));
                      updateLocation({ translationTerm: event.target.value || null, translationLabel: null });
                    }}
                  />
                </div>
                <EditorSegmentedControl label="Words list" value={wordsList} onChange={(next) => openWordsList(next as WordsList)} options={[
                  { value: "terms", label: "Glossary terms", disabled: locked },
                  { value: "labels", label: "UI labels", disabled: locked },
                  { value: "style", label: "Style guide", disabled: locked },
                ]} />
              </div>
              {visitedViews.labels ? <div hidden={wordsList !== "labels"}><UiTranslationWorkbench key={data.locale} locale={data.locale} editDrafts={uiEditDrafts.current} search={filters.search} onSearchChange={(search) => setFilters((current) => ({ ...current, search }))} /></div> : null}
              {visitedViews.style ? <div hidden={wordsList !== "style"}><StyleGuidePanel key={data.locale} locale={data.locale} /></div> : null}
            <section aria-label="Glossary terms" hidden={wordsList !== "terms"} className="space-y-4">
            <p className="theme-text-secondary text-sm">Choose one category to work through. Search finds terms across categories.</p>
            <GlossaryFilterBar
              filters={filters}
              setFilters={(next) => {
                const value = typeof next === "function" ? next(filters) : next;
                setFilters(value);
                updateLocation({ translationStatus: value.status });
              }}
              draftCount={counts.drafts}
              uncheckedCount={counts.unchecked}
              shownDraftCount={shownDrafts.length}
              shownUncheckedCount={shownUnchecked.length}
              locked={locked}
              onApproveShown={approveShown}
              onConfirmShown={() => confirmLive(shownUnchecked.map((row) => row.term), "shown")}
            />

            {workingRows.length > 0 ? <ReasonKindChips label="Approval reason" value={approvalKind} disabled={locked} onChange={setApprovalKind} /> : null}

            <GlossaryActionBar
              locale={data.locale}
              locked={locked}
              canAdmin={canAdmin}
              activity={busy ? BUSY_LABEL[busy] : writing ? (writing.field === "definition" ? "Saving definition" : `Saving "${writing.term}"`) : null}
              onImport={(file) => void importFile(file)}
              onDraft={draft}
            />
            {canDefine ? (
              <p className="theme-text-faint text-xs">
                Definitions tell the translator and the model what each term means on this site; edit one by clicking it.
              </p>
            ) : null}

            {reviewComplete ? (
              <StateCard
                tone={pending.length > 0 && !nothingTranslatedYet ? "warning" : "success"}
                icon={pending.length > 0 && !nothingTranslatedYet ? "lucide:languages" : "lucide:check-check"}
                title={`All ${count(data.rows.length, "term")} for ${data.locale} are reviewed`}
                description={nothingTranslatedYet
                  ? `Nothing has been translated under these terms yet.${canAdmin ? " Start the main translation from Runs in Pages." : ""}`
                  : pending.length > 0
                    ? `${count(pending.length, "approved rendering")} ${pending.length === 1 ? "has" : "have"} not been queued for propagation yet. Retranslating redoes only the translations that mention ${pending.length === 1 ? "it" : "them"}.${canAdmin ? " Retranslate from Runs in Pages." : ""}`
                    : "No reviewed term changes are waiting to be requested."}
                compact
              />
            ) : canAdmin && data.rows.length > 0 ? (
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
                    expanded={Boolean(filters.search.trim()) || category === group.category.id}
                    editDrafts={termEditDrafts.current}
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
            </section>
            </div>

            {visitedViews.pages ? (
              <div hidden={view !== "pages"} className="space-y-4">
                <NarrativeReview key={data.locale} locale={data.locale} canAdmin={canAdmin} />
                <WorkbenchDrawer key={`coverage:${data.locale}`} title="Coverage" defaultOpen={pagesSection === "coverage"}>
                  <TranslationCoverage locale={data.locale} />
                </WorkbenchDrawer>
                <WorkbenchDrawer key={`changes:${data.locale}`} title="Recent changes" defaultOpen={pagesSection === "changes"}>
                  <TranslationChanges locale={data.locale} />
                </WorkbenchDrawer>
                <GlossaryReaderFeedback key={data.locale} locale={data.locale} />
                {canAdmin ? (
                  <WorkbenchDrawer title="Runs" detail={runStatus(data, busy === "start") ?? "No run recorded"}>
                    <RunsPanel
                      data={data}
                      pending={pending}
                      reviewComplete={reviewComplete}
                      draftCount={draftCount}
                      locked={locked}
                      starting={busy === "start"}
                      refreshError={refreshError}
                      onRefresh={() => void load(data.locale, true)}
                      onStart={startMain}
                      onRetranslate={retranslate}
                      onRetryExhausted={retryExhausted}
                    />
                  </WorkbenchDrawer>
                ) : null}
              </div>
            ) : null}
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

/** The latest run in a few words for the status strip and the Runs heading, or `null` when there has been none. */
function runStatus(data: GlossaryList, starting: boolean): string | null {
  const { jobs } = data;
  if (starting) return "Preparing a translation run";
  if (!jobs.total) return null;
  const settled = Math.min(jobs.total, jobs.completed + jobs.exhausted);
  const percent = Math.round(settled / jobs.total * 100);
  const issues = jobs.completedWithRejections + jobs.exhausted;
  return `${jobs.active > 0 ? "Translation running" : "Latest run"}: ${percent}% processed${issues ? `, ${issues.toLocaleString()} need attention` : ""}`;
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
