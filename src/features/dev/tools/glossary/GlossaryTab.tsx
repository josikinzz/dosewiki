"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  EditorField,
  EditorNavTabs,
  EditorSelect,
  EditorStatusPill,
  LoadErrorState,
  SaveLine,
  useConfirm,
  useDevShortcuts,
  useUnsavedWork,
  useUnsavedWorkRegistry,
  type NoticeMessage,
  type SaveLineCopy,
} from "@/features/dev/components";
import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { parseWorkbenchDeepLink, type PagesSection, type WorkbenchView, type WordsList } from "@server/translation/reviewInboxTypes";
import type { ReviewReason } from "@server/translation/reviewReason";
import {
  applyRowPatch,
  approveTerms,
  confirmTerms,
  count,
  DEFAULT_FILTERS,
  describeWriteRefusal,
  draftMissingTerms,
  fetchGlossary,
  fetchGlossaryProgress,
  groupRows,
  isLiveUnchecked,
  languageLabel,
  needsReview,
  reviewCounts,
  GlossaryReviewCollision,
  importGlossaryCsv,
  retranslateTerms,
  retryExhaustedPages,
  saveGloss,
  saveTermDraft,
  startMainTranslation,
  STATE_WORD,
  type GlossaryFilters,
  type GlossaryGroup,
  type GlossaryList,
  type GlossaryRow,
  type GlossaryRowPatch,
  type GlossaryStatusFilter,
} from "./glossaryModel";
import type { ArticlesSection } from "./ArticlesView";
import { DraftMap, useDraftMapHasEntries, type DraftMapOf } from "./draftMap";
import { GlossaryCollisionDialog } from "./GlossaryCollisionDialog";
import { type GlossaryEditDrafts, type GlossaryRowNotice } from "./GlossaryReviewTable";
import { GlossaryActionBar } from "./GlossaryToolbar";
import { importConfirmation, readGlossaryImport } from "./glossaryImport";
import { StatusLegend } from "./StatusLegend";
import { TermsWorkspace } from "./TermsWorkspace";
import { type NextCategory } from "./TermsOverview";
import type { UiEditDrafts } from "./UiTranslationWorkbench";
import { RowSkeletons } from "./workbenchParts";
import { ArticlesView, ReaderSuggestions, ReviewInbox, StyleGuidePanel, UiTranslationWorkbench } from "./lazyPanels";
import { useReaderSuggestionCount } from "./readerSuggestionCount";
import { useHeldInPlace } from "./useHeldInPlace";
import { workbenchTabs, type WorkbenchSection } from "./workbenchSections";

type WriteResult = { message: string; patch: GlossaryRowPatch | null };

type Busy = "load" | "approve" | "confirm" | "draft" | "retranslate" | "start" | "retry" | "import" | null;

const RUN_WRITES = new Set<Busy>(["retranslate", "start", "retry"]);

type Writing = { term: string; field: "rendering" | "definition" };

type Handoff = { order: string[]; index: number; stay: boolean };

type CollisionReview = {
  locale: string;
  error: GlossaryReviewCollision;
  kind: Exclude<Busy, null>;
  action: (collisionConfirmation?: string) => Promise<string | WriteResult>;
  term?: string;
  stay?: boolean;
};

type WorkbenchNotice = NoticeMessage & { where: "terms" | "runs" };

const GLOSSARY_SAVE_COPY: SaveLineCopy = {
  label: "Save draft waits for a reviewer. Approve puts wording in use.",
  detail: "A saved draft changes nothing readers see. Approving a term puts it in every prompt at once; approved interface text ships with the next site release, and an approved paragraph publishes to its article.",
  icon: "lucide:file-pen-line",
  tone: "info",
};

const SEARCH_SHORTCUT = [{ keys: "/", label: "Search terms and interface text" }] as const;

type GlossaryTabProps = {
  viewerRole: AppRole | null;
};

export function GlossaryTab({ viewerRole }: GlossaryTabProps) {
  const fieldId = useId();
  const [view, setView] = useState<WorkbenchView>("words");
  const [visitedViews, setVisitedViews] = useState<Record<WorkbenchView | "labels" | "style", boolean>>({ inbox: false, suggestions: false, words: false, pages: false, labels: false, style: false });
  const [wordsList, setWordsList] = useState<WordsList>("terms");
  const [pagesSection, setPagesSection] = useState<PagesSection | null>(null);
  const [articleLink, setArticleLink] = useState(0);
  const [fromInbox, setFromInbox] = useState(false);
  const applyDeepLink = (search: string) => {
    const link = parseWorkbenchDeepLink(search) ?? { view: "words" as const, words: "terms" as const };
    setView(link.view);
    setVisitedViews((visited) => ({ ...visited, [link.view]: true, labels: visited.labels || link.words === "labels", style: visited.style || link.words === "style" }));
    if (link.words) setWordsList(link.words);
    if (link.view === "pages") setPagesSection(link.pages ?? null);
    const params = new URLSearchParams(search);
    setCategory(params.get("translationCategory"));
    const status = params.get("translationStatus");
    if (status === "all" || status === "draft" || status === "unchecked" || status === "approved") setFilters((current) => ({ ...current, status }));
    if (link.term) setFilters({ status: "all", search: link.term });
    if (link.label) setFilters((current) => ({ ...current, search: link.label ?? "" }));
    return link;
  };
  useEffect(() => {
    const link = applyDeepLink(window.location.search);
    if (link.view !== "pages") return;
    const requestedLocale = new URLSearchParams(window.location.search).get("translationLocale");
    if (requestedLocale) setLocale(requestedLocale);
  }, []);
  const openInboxLink = (href: string) => {
    const url = new URL(href, window.location.href);
    if (url.pathname !== window.location.pathname) {
      window.location.assign(url);
      return;
    }
    window.history.replaceState(window.history.state, "", url);
    const link = applyDeepLink(url.search);
    if (link.view === "pages") setArticleLink((current) => current + 1);
    setFromInbox(link.view !== "inbox");
    window.scrollTo({ top: 0 });
  };
  const updateLocation = (values: Record<string, string | null>) => {
    const url = new URL(window.location.href);
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
    setView("words");
    setVisitedViews((current) => ({ ...current, words: true, [next]: true }));
  };
  const section: WorkbenchSection = view === "words" ? wordsList : view;
  const openSection = (next: WorkbenchSection) => {
    setFromInbox(false);
    if (next === "terms" || next === "labels" || next === "style") openWordsList(next);
    else openView(next);
  };
  const [uiEditDrafts] = useState<DraftMapOf<UiEditDrafts>>(() => new DraftMap());
  const [termEditDrafts] = useState<DraftMapOf<GlossaryEditDrafts>>(() => new DraftMap());
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
  const { rows, hold: holdInPlace, release: releaseHeld } = useHeldInPlace(data, filters);
  const [busy, setBusy] = useState<Busy>(null);
  const [writing, setWriting] = useState<Writing | null>(null);
  const writingTerm = writing?.term ?? null;
  const [notice, setNotice] = useState<WorkbenchNotice | null>(null);
  const [rowNotice, setRowNotice] = useState<GlossaryRowNotice | null>(null);
  const handoff = useRef<Handoff | null>(null);
  const [collisionReview, setCollisionReview] = useState<CollisionReview | null>(null);
  const collisionReturnFocus = useRef<HTMLElement | null>(null);
  const actionVersion = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const uiSearchRef = useRef<HTMLInputElement>(null);
  const [inboxTotal, setInboxTotal] = useState<number | null>(null);
  const [labelsWaiting, setLabelsWaiting] = useState<number | null>(null);
  const suggestionsWaiting = useReaderSuggestionCount(locale, view);
  const pending = data?.pending ?? [];
  const { confirm, dialog } = useConfirm();
  const locked = busy !== null || writingTerm !== null || collisionReview !== null;
  const navLocked = busy !== null || collisionReview !== null;

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

  const hasTermDrafts = useDraftMapHasEntries(termEditDrafts);
  const hasUiDrafts = useDraftMapHasEntries(uiEditDrafts);
  const languageName = locale ? languageLabel(locale) : "this language";
  useUnsavedWork({
    kind: "discard-only",
    because: "Save each term change from the Glossary after review.",
    id: "glossary:terms",
    tab: "glossary",
    label: `Glossary: term wording in ${languageName}`,
    dirty: hasTermDrafts,
    discard: () => termEditDrafts.clear(),
  });
  useUnsavedWork({
    kind: "discard-only",
    because: "Save each interface text change from the Glossary after review.",
    id: "glossary:ui-text",
    tab: "glossary",
    label: `Glossary: interface text in ${languageName}`,
    dirty: hasUiDrafts,
    discard: () => uiEditDrafts.clear(),
  });
  const { confirmExit } = useUnsavedWorkRegistry();

  const searching = view === "words" && wordsList !== "style";
  useDevShortcuts(SEARCH_SHORTCUT, searching);
  useEffect(() => {
    if (!searching) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) return;
      event.preventDefault();
      (wordsList === "labels" ? uiSearchRef : searchRef).current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searching, wordsList]);

  const pollProgress = useCallback(async (code: string, promptVersion: string) => {
    if (refreshInFlight.current) return;
    const version = loadVersion.current;
    refreshInFlight.current = true;
    try {
      const next = await fetchGlossaryProgress(code, promptVersion);
      if (version !== loadVersion.current) return;
      setRefreshError(null);
      setData((current) => current && current.locale === next.locale ? { ...current, jobs: next.jobs, segments: next.segments } : current);
    } catch (error) {
      if (version === loadVersion.current) setRefreshError(error instanceof Error ? error.message : "Unable to refresh progress.");
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  const refresh = async () => {
    releaseHeld();
    setBusy("load");
    try {
      await load(locale);
    } finally {
      setBusy(null);
    }
  };

  const runActive = (data?.jobs.active ?? 0) > 0;
  const pollLocale = data?.locale ?? null;
  const pollVersion = data?.promptVersion ?? null;
  useEffect(() => {
    if (!runActive || !pollLocale || !pollVersion || locked) return;
    const timer = window.setInterval(() => void pollProgress(pollLocale, pollVersion), 5000);
    return () => window.clearInterval(timer);
  }, [runActive, pollLocale, pollVersion, pollProgress, locked]);

  useEffect(() => {
    if (writingTerm !== null || !handoff.current) return;
    const { order, index, stay } = handoff.current;
    handoff.current = null;
    const rows: Record<string, HTMLElement> = {};
    for (const row of document.querySelectorAll<HTMLElement>("[data-term]")) rows[row.dataset.term ?? ""] = row;
    const written = rows[order[index]];
    if (stay && written) {
      (written.querySelector<HTMLElement>('[data-row-action="approve"]') ?? written.querySelector("input"))?.focus();
      return;
    }
    const next = order.slice(index + 1).find((term) => rows[term]?.dataset.needsReview === "true");
    rows[next ?? order[index]]?.querySelector<HTMLInputElement>('input[aria-label^="Translation for"]')?.focus();
  }, [writingTerm]);

  const groups = useMemo(() => groupRows(rows), [rows]);
  const allGroups = useMemo(() => (data ? groupRows(data.rows) : []), [data]);
  const totals = useMemo(() => {
    const byCategory: Record<string, { total: number; draft: number; unchecked: number }> = {};
    for (const group of allGroups) byCategory[group.category.id] = { total: group.rows.length, draft: group.draftCount, unchecked: group.uncheckedCount };
    return byCategory;
  }, [allGroups]);
  const counts = reviewCounts(data?.rows ?? []);
  const draftCount = data ? data.rows.filter(needsReview).length : 0;
  const nextCategory = useMemo<NextCategory | null>(() => {
    const next = allGroups.find((group) => group.draftCount + group.uncheckedCount > 0);
    return next ? { id: next.category.id, label: next.category.label, left: next.draftCount + next.uncheckedCount } : null;
  }, [allGroups]);
  const reviewComplete = !!data && data.rows.length > 0 && draftCount === 0;
  const nothingTranslatedYet = !!data && data.segments.total === 0;
  const toggleGroup = (id: string) => {
    if (filters.search.trim()) {
      document.getElementById(`glossary-terms-pane-${id}`)?.scrollIntoView({ block: "start" });
      return;
    }
    const next = category === id ? null : id;
    setCategory(next);
    updateLocation({ translationCategory: next });
  };
  const closeCategory = () => {
    setCategory(null);
    updateLocation({ translationCategory: null });
  };

  const [continueTo, setContinueTo] = useState<string | null>(null);
  const continueReview = (id: string) => {
    const status = filters.status === "draft" || filters.status === "unchecked" ? filters.status : "all";
    setFilters({ status, search: "" });
    setCategory(id);
    updateLocation({ translationCategory: id, translationStatus: status, translationTerm: null, translationLabel: null });
    setContinueTo(id);
  };
  useEffect(() => {
    if (!continueTo) return;
    setContinueTo(null);
    const target = document.querySelector<HTMLElement>(`[data-testid="glossary-group-${continueTo}"] [data-needs-review="true"] input[aria-label^="Translation for"]`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "center" });
  }, [continueTo]);

  const applyPatch = useCallback((patch: GlossaryRowPatch) => {
    ++loadVersion.current;
    setData((current) => current && applyRowPatch(current, patch));
  }, []);

  const run = useCallback(
    async (kind: Exclude<Busy, null>, action: (collisionConfirmation?: string) => Promise<string | WriteResult>, term?: string, collisionConfirmation?: string, stay = false) => {
      if (!locale) return;
      const version = ++actionVersion.current;
      setCollisionReview(null);
      if (!collisionConfirmation) collisionReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (term) setWriting({ term, field: "rendering" }); else setBusy(kind);
      setNotice(null);
      setRowNotice(null);
      const where = RUN_WRITES.has(kind) ? "runs" : "terms";
      try {
        const order = Array.from(document.querySelectorAll<HTMLElement>("[data-term]"), (row) => row.dataset.term ?? "");
        const result = await action(collisionConfirmation);
        if (version !== actionVersion.current) return;
        const { message, patch } = typeof result === "string" ? { message: result, patch: null } : result;
        if (patch) applyPatch(patch); else await load(locale);
        if (term) handoff.current = { order, index: order.indexOf(term), stay };
        if (term) setRowNotice({ term, tone: "success", message }); else setNotice({ tone: "success", message, where });
      } catch (error) {
        if (version !== actionVersion.current) return;
        if (error instanceof GlossaryReviewCollision) {
          setCollisionReview({ locale, error, kind, action, term, stay });
        } else {
          const refusal = describeWriteRefusal(error, "The change did not go through.");
          if (term) setRowNotice({ term, tone: "danger", ...refusal });
          else setNotice({ tone: "danger", message: refusal.message, where });
        }
      } finally {
        if (term) setWriting(null); else setBusy(null);
      }
    },
    [applyPatch, load, locale],
  );

  const approveOne = (row: GlossaryRow) =>
    run("approve", async (collisionConfirmation) => {
      const { patch } = await approveTerms(locale!, [row.term], collisionConfirmation, { [row.term]: row.revision });
      holdInPlace([row.term]);
      return { message: `Approved "${row.term}".`, patch };
    }, row.term);

  const approveMany = (terms: readonly string[]) =>
    run("approve", async (collisionConfirmation) => {
      const approved = await approveTerms(locale!, terms, collisionConfirmation, Object.fromEntries((data?.rows ?? []).filter((row) => terms.includes(row.term)).map((row) => [row.term, row.revision])));
      holdInPlace(approved.terms);
      return { message: `Approved ${count(approved.terms.length, "term")}.`, patch: approved.patch };
    });

  const wordingList = (terms: readonly string[], heading: string) => {
    const byTerm = new Map((data?.rows ?? []).map((row) => [row.term, row]));
    return (
      <div className="space-y-2">
      <p className="type-meta-label theme-text-muted">{heading}</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
        {terms.map((term) => (
          <li key={term} className="flex flex-wrap items-baseline gap-x-2">
            <span className="theme-text-primary">{term}</span>
            <span aria-hidden className="theme-text-faint">→</span>
            <span className="sr-only">, </span>
            <span lang={byTerm.get(term)?.locale} dir="auto" className="theme-text-secondary">{byTerm.get(term)?.target}</span>
          </li>
        ))}
      </ul>
      </div>
    );
  };

  const confirmApprove = (terms: readonly string[], where: string) => {
    confirm({
      title: `Approve the ${count(terms.length, `${STATE_WORD.draft} term`)} ${where === "shown" ? "shown" : `in ${where}`}?`,
      description: "Each translation is approved as it stands and will be used wherever the term appears. Terms already approved are unchanged.",
      confirmLabel: where === "shown" ? "Approve all shown" : `Approve ${where}`,
      body: wordingList(terms, `Approves ${count(terms.length, "term")}`),
      onConfirm: () => void approveMany(terms),
    });
  };

  const revisionsOf = (terms: readonly string[]) =>
    Object.fromEntries((data?.rows ?? []).filter((row) => terms.includes(row.term)).map((row) => [row.term, row.revision]));

  const confirmOne = (row: GlossaryRow) =>
    run("confirm", async (collisionConfirmation) => {
      const { patch } = await confirmTerms(locale!, [row.term], { [row.term]: row.revision }, collisionConfirmation);
      return { message: `Confirmed "${row.term}".`, patch };
    }, row.term);

  const confirmMany = (terms: readonly string[]) =>
    run("confirm", async (collisionConfirmation) => {
      const confirmed = await confirmTerms(locale!, terms, revisionsOf(terms), collisionConfirmation);
      return { message: `Confirmed ${count(confirmed.terms.length, "term")}.`, patch: confirmed.patch };
    });

  const confirmLive = (terms: readonly string[], where: string) => {
    confirm({
      title: `Confirm the ${count(terms.length, "live, never checked term")} ${where === "shown" ? "shown" : `in ${where}`}?`,
      description: "Each translation is recorded as checked by you, exactly as readers see it now. The wording on the site does not change. Edit any you disagree with instead.",
      confirmLabel: where === "shown" ? "Confirm all shown" : `Confirm ${where}`,
      body: wordingList(terms, `Confirms ${count(terms.length, "term")}`),
      onConfirm: () => void confirmMany(terms),
    });
  };

  const saveTarget = (row: GlossaryRow, target: string, reason: ReviewReason) =>
    run("approve", async (collisionConfirmation) => {
      const { row: saved, patch } = await saveTermDraft(locale!, row.term, target, collisionConfirmation, row.revision, reason);
      termEditDrafts.delete(JSON.stringify([row.locale, row.term]));
      return { message: `Saved "${saved.term}" as ${saved.target}; awaiting approval.`, patch };
    }, row.term, undefined, true);

  const saveAndApprove = (row: GlossaryRow, target: string, reason: ReviewReason) => {
    let saved: GlossaryRow | null = null;
    return run("approve", async (collisionConfirmation) => {
      if (!saved) {
        const draft = await saveTermDraft(locale!, row.term, target, collisionConfirmation, row.revision, reason);
        saved = draft.row;
        if (draft.patch) applyPatch(draft.patch);
      }
      termEditDrafts.delete(JSON.stringify([row.locale, row.term]));
      const { patch } = await approveTerms(locale!, [row.term], collisionConfirmation, { [row.term]: saved.revision }, reason);
      holdInPlace([row.term]);
      return { message: `Approved "${row.term}" as ${saved.target}.`, patch };
    }, row.term);
  };

  const saveDefinition = async (row: GlossaryRow, gloss: string) => {
    ++actionVersion.current;
    setCollisionReview(null);
    setWriting({ term: row.term, field: "definition" });
    setNotice(null);
    setRowNotice(null);
    try {
      const saved = await saveGloss(row.term, gloss);
      setData((current) => current && { ...current, glosses: { ...current.glosses, [saved.term]: saved.gloss } });
      setRowNotice({ term: row.term, tone: "success", message: `Saved the definition of "${saved.term}".` });
    } catch (error) {
      setRowNotice({ term: row.term, tone: "danger", ...describeWriteRefusal(error, "The definition was not saved.") });
    } finally {
      setWriting(null);
    }
  };

  const reloadRow = (term: string) => {
    const key = JSON.stringify([locale, term]);
    const reload = () => {
      termEditDrafts.delete(key);
      setRowNotice(null);
      void load(locale);
    };
    if (!termEditDrafts.has(key)) return reload();
    confirm({
      title: `Load the latest wording of “${term}”?`,
      description: "Someone saved this term after you opened it. Loading their version drops the wording you typed for it; other rows keep theirs.",
      confirmLabel: "Load the latest version",
      destructive: true,
      onConfirm: reload,
    });
  };

  const retranslate = () => {
    const terms = [...pending];
    confirm({
      title: `Retranslate everything that mentions ${count(terms.length, "term")}?`,
      description: "Request background updates for translations that mention these terms. Runs and Coverage in Articles track the processing.",
      confirmLabel: "Retranslate",
      affected: terms,
      affectedLabel: `Mentions of ${count(terms.length, "term")}`,
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
      title: `Draft the missing terms for ${languageLabel(locale!)}?`,
      description: `Every term the site publishes that this locale has no row for is rendered by the model and added as ${STATE_WORD.draft}. Existing rows are never touched. This calls the model a few hundred times for a new locale.`,
      confirmLabel: "Draft missing terms",
      onConfirm: () =>
        void run("draft", async () => {
          const summary = await draftMissingTerms(locale!);
          setFilters((current) => ({ ...current, status: "draft" }));
          const caveats = [
            summary.flagged > 0 ? `${summary.flagged} need a closer look` : null,
            summary.shared > 0 ? `${summary.shared} share a translation with another term` : null,
            summary.failed > 0 ? `${summary.failed} could not be drafted` : null,
          ].filter((part): part is string => part !== null);
          return `Drafted ${count(summary.drafted, "term")} for review${caveats.length > 0 ? `; ${caveats.join(", ")}` : ""}.`;
        }),
    });

  const startMain = () =>
    confirm({
      title: `Start the main translation for ${languageLabel(locale!)}?`,
      description: "Every public page will be translated in the background through one shared pool capped at 100 simultaneous requests to the translation model.",
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
      title: `Retry ${count(pages, "failed page")} for ${languageLabel(locale!)}?`,
      description: "Pages in the latest run that stopped after repeated failures get a fresh set of attempts in the same run. Finished pages and saved translations are untouched.",
      confirmLabel: "Retry failed pages",
      onConfirm: () =>
        void run("retry", async () => `Queued ${count(await retryExhaustedPages(locale!), "page")} for another attempt.`),
    });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const read = await readGlossaryImport(file);
    if ("error" in read) return setNotice({ tone: "danger", message: read.error, where: "terms" });
    confirm(importConfirmation(read, locale!, () =>
      void run("import", async (collisionConfirmation) => {
        const summary = await importGlossaryCsv(locale!, read.csv, collisionConfirmation);
        return `Imported ${count(summary.drafts, "draft")}; each requires explicit approval.`;
      })));
  };

  const requestLocale = (code: string) => {
    if (code === locale) return;
    confirmExit(() => changeLocale(code), "tab", { tab: "glossary" });
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
    setNotice(null);
    setRowNotice(null);
    setInboxTotal(null);
    setLabelsWaiting(null);
    url.searchParams.delete("translationCategory");
    url.searchParams.delete("translationTerm");
    url.searchParams.delete("translationLabel");
    url.searchParams.delete("translationStatus");
    window.history.replaceState(window.history.state, "", url);
    setData(null);
    void load(code);
  };

  const setSearch = (search: string) => {
    setFilters((current) => ({ ...current, search }));
    updateLocation({ translationTerm: search || null, translationLabel: null });
  };
  const setStatus = (status: GlossaryStatusFilter) => {
    setFilters((current) => ({ ...current, status }));
    updateLocation({ translationStatus: status });
  };

  const articlesSection: ArticlesSection | null = pagesSection;
  const [articlesRequest, setArticlesRequest] = useState<{ section: ArticlesSection; n: number } | null>(null);
  const openRuns = () => {
    setArticlesRequest((current) => ({ section: "runs", n: (current?.n ?? 0) + 1 }));
    openView("pages");
    window.scrollTo({ top: 0 });
  };
  const changeArticlesSection = (next: ArticlesSection) => {
    updateLocation({ translationView: next === "coverage" || next === "changes" ? next : "pages" });
  };

  const status = data ? operationalStatus(data, busy === "start", refreshError) : null;
  const termsLeft = counts.drafts + counts.unchecked;
  const tabOptions = workbenchTabs({ inbox: inboxTotal, suggestions: suggestionsWaiting, terms: data ? termsLeft : null, labels: labelsWaiting }, navLocked);

  const activity = busy ? BUSY_LABEL[busy] : writing ? (writing.field === "definition" ? "Saving definition" : `Saving "${writing.term}"`) : null;
  const termsNotice: NoticeMessage | null = notice?.where === "terms"
    ? notice
    : rowNotice && !rows.some((row) => row.term === rowNotice.term)
      ? { tone: rowNotice.tone, message: rowNotice.message }
      : null;

  return (
    <div className="space-y-6">
      <DevToolSection
        tool="glossary"
        description="The translation workbench. Review how dose.wiki reads in your language. You can approve your own edits: Save and approve puts your wording in use, and Save draft leaves it for another reviewer."
        actions={<span className="max-sm:hidden"><SaveLine model="instant" copy={GLOSSARY_SAVE_COPY} /></span>}
        className="relative z-20"
      >
        <div className="sm:hidden">
          <SaveLine model="instant" copy={GLOSSARY_SAVE_COPY} />
        </div>
        {loadError ? (
          <LoadErrorState what="the glossary" message={loadError} onRetry={() => void load(locale)} />
        ) : data === null ? (
          <RowSkeletons rows={2} label="the glossary" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-x-3 gap-y-2 sm:flex-wrap sm:gap-x-4">
              {data.locales.length === 1 ? (
                <div className="min-w-0 flex-1 space-y-1 sm:flex-none">
                  <p className="theme-text-secondary text-sm font-medium">Language</p>
                  <p className="theme-text-primary flex min-h-10 items-center gap-2 text-sm">
                    <span lang={data.locale}>{languageLabel(data.locale)}</span>
                    {data.locales[0].live ? <EditorStatusPill tone="success" inline>Live on the site</EditorStatusPill> : null}
                  </p>
                </div>
              ) : (
                <EditorField htmlFor={`${fieldId}-language`} label="Language" className="min-w-0 flex-1 sm:w-96 sm:flex-none">
                  <EditorSelect
                    id={`${fieldId}-language`}
                    selectSize="sm"
                    value={data.locale}
                    options={data.locales.map((option) => ({
                      value: option.locale,
                      label: `${languageLabel(option.locale)}${option.live ? " · live on the site" : ""}`,
                    }))}
                    disabled={locked}
                    onChange={(event) => requestLocale(event.target.value)}
                  />
                </EditorField>
              )}
              <Button type="button" variant="ghost" size="sm" className="shrink-0 max-sm:size-10 max-sm:px-0 [@media(pointer:coarse)]:min-h-11" onClick={() => void refresh()} disabled={locked} aria-busy={busy === "load" || undefined} title="Refresh this language">
                <Icon icon="lucide:refresh-cw" size={14} className={busy === "load" ? "motion-safe:animate-spin" : undefined} />
                <span className="max-sm:sr-only">{busy === "load" ? "Refreshing" : "Refresh"}</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <EditorNavTabs label="Workbench view" value={section} onChange={(next) => openSection(next as WorkbenchSection)} options={tabOptions} />
              <StatusLegend />
            </div>
            {fromInbox && view !== "inbox" ? (
              <p className="theme-text-muted flex flex-wrap items-center gap-x-2 text-sm">
                <Icon icon="lucide:inbox" size={14} className="shrink-0" />
                Opened from the Inbox.
                <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => openSection("inbox")}>Back to Waiting</Button>
              </p>
            ) : null}
            {view === "pages" || view === "inbox" ? (
              <p className={cn("text-xs", status?.failed ? "text-[color:var(--theme-warning-text)]" : "theme-text-muted")} data-testid="translation-summary">
                {status?.text}
              </p>
            ) : null}
          </div>
        )}
      </DevToolSection>

      {data ? (
        <>
          {visitedViews.inbox ? (
            <div id="glossary-view-inbox" role="tabpanel" aria-label="Waiting" hidden={view !== "inbox"}>
              <ReviewInbox key={data.locale} locale={data.locale} onOpen={openInboxLink} onTotalChange={setInboxTotal} active={view === "inbox"} />
            </div>
          ) : null}

          {visitedViews.suggestions ? (
            <div id="glossary-view-suggestions" role="tabpanel" aria-label="Suggestions" hidden={view !== "suggestions"}>
              <ReaderSuggestions key={data.locale} locale={data.locale} />
            </div>
          ) : null}

          <div id="glossary-view-terms" role="tabpanel" aria-label="Terms" hidden={view !== "words" || wordsList !== "terms"}>
            {data.rows.length === 0 ? (
              <EmptyTerms canAdmin={canAdmin} actions={<GlossaryActionBar locale={data.locale} locked={locked} canAdmin={canAdmin} onImport={(file) => void importFile(file)} onDraft={draft} />} notice={notice?.where === "terms" ? notice : null} onDismissNotice={() => setNotice(null)} activity={activity} />
            ) : (
              <section aria-label="Glossary terms">
                <TermsWorkspace
                  paneId="glossary-terms-pane"
                  allGroups={allGroups}
                  groups={groups}
                  totals={totals}
                  counts={counts}
                  totalRows={data.rows.length}
                  filters={filters}
                  onSearch={setSearch}
                  onStatus={setStatus}
                  searchRef={searchRef}
                  category={category}
                  onToggleCategory={toggleGroup}
                  onCloseCategory={closeCategory}
                  next={nextCategory}
                  canAdmin={canAdmin}
                  canDefine={canDefine}
                  pendingCount={pending.length}
                  nothingTranslatedYet={nothingTranslatedYet}
                  locked={locked}
                  onContinue={continueReview}
                  onOpenRuns={openRuns}
                  actions={<GlossaryActionBar locale={data.locale} locked={locked} canAdmin={canAdmin} onImport={(file) => void importFile(file)} onDraft={draft} />}
                  activity={activity}
                  notice={termsNotice}
                  onDismissNotice={() => { setNotice(null); setRowNotice(null); }}
                  hasUnsaved={hasTermDrafts}
                  editDrafts={termEditDrafts}
                  busy={busy !== null}
                  writingTerm={writingTerm}
                  glosses={data.glosses}
                  usages={data.usages ?? {}}
                  rowNotice={rowNotice}
                  onApproveAll={(group: GlossaryGroup) => confirmApprove(group.rows.filter((row) => row.status === "draft").map((row) => row.term), group.category.label)}
                  onConfirmAll={(group: GlossaryGroup) => confirmLive(group.rows.filter(isLiveUnchecked).map((row) => row.term), group.category.label)}
                  onApprove={(row) => void approveOne(row)}
                  onConfirm={(row) => void confirmOne(row)}
                  onSave={saveTarget}
                  onSaveAndApprove={(row, target, reason) => void saveAndApprove(row, target, reason)}
                  onSaveDefinition={(row, gloss) => void saveDefinition(row, gloss)}
                  onRestored={async (patch) => { if (patch) applyPatch(patch); else await load(locale); }}
                  onReload={reloadRow}
                />
              </section>
            )}
          </div>

          {visitedViews.labels ? (
            <div id="glossary-view-labels" role="tabpanel" aria-label="Interface text" hidden={view !== "words" || wordsList !== "labels"}>
              <UiTranslationWorkbench key={data.locale} locale={data.locale} editDrafts={uiEditDrafts} search={filters.search} onSearchChange={setSearch} searchRef={uiSearchRef} onWaitingChange={setLabelsWaiting} />
            </div>
          ) : null}

          {visitedViews.style ? (
            <div id="glossary-view-style" role="tabpanel" aria-label="Style guide" hidden={view !== "words" || wordsList !== "style"}>
              <StyleGuidePanel key={data.locale} locale={data.locale} />
            </div>
          ) : null}

          {visitedViews.pages ? (
            <div id="glossary-view-pages" role="tabpanel" aria-label="Articles" hidden={view !== "pages"}>
              <ArticlesView
                key={data.locale}
                locale={data.locale}
                canAdmin={canAdmin}
                articleLink={articleLink}
                initialSection={articlesSection}
                sectionRequest={articlesRequest}
                onSectionChange={changeArticlesSection}
                runs={{
                  data,
                  pending,
                  reviewComplete,
                  draftCount,
                  locked,
                  starting: busy === "start",
                  refreshError,
                  onRefresh: () => void load(data.locale, true),
                  onStart: startMain,
                  onRetranslate: retranslate,
                  onRetryExhausted: retryExhausted,
                  status: runStatus(data, busy === "start"),
                  activity: busy && RUN_WRITES.has(busy) ? BUSY_LABEL[busy] : null,
                  notice: notice?.where === "runs" ? notice : null,
                  onDismissNotice: () => setNotice(null),
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {dialog}
      <GlossaryCollisionDialog
        review={collisionReview}
        returnFocus={collisionReturnFocus}
        onCancel={() => setCollisionReview(null)}
        onAllow={() => {
          if (!collisionReview || collisionReview.locale !== locale) return;
          const review = collisionReview;
          setCollisionReview(null);
          void run(review.kind, review.action, review.term, review.error.collisionConfirmation, review.stay);
        }}
      />
    </div>
  );
}

function EmptyTerms({ canAdmin, actions, notice, onDismissNotice, activity }: { canAdmin: boolean; actions: React.ReactNode; notice: NoticeMessage | null; onDismissNotice: () => void; activity: string | null }) {
  return (
    <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-prose space-y-1">
          <h3 className="theme-text-primary flex items-center gap-2 text-base font-semibold"><Icon icon="lucide:book-a" size={18} className="theme-icon-accent" />No terms yet</h3>
          <p className="theme-text-secondary text-sm">{canAdmin ? "Draft the missing terms or import a CSV from More to begin the review." : "Import a CSV from More, or ask an admin to draft the missing terms, to begin the review."}</p>
        </div>
        {actions}
      </div>
      {activity || notice ? <div className="mt-4 space-y-2">{activity ? <p className="theme-text-muted text-xs" aria-live="polite">{activity}</p> : null}{notice ? <NoticeLine notice={notice} onDismiss={onDismissNotice} /> : null}</div> : null}
    </div>
  );
}

function NoticeLine({ notice, onDismiss }: { notice: NoticeMessage; onDismiss: () => void }) {
  return <p role="status" className={cn("flex items-center gap-2 text-sm", notice.tone === "danger" ? "text-[color:var(--theme-danger-text)]" : "theme-text-secondary")}>{notice.message}<Button type="button" variant="link" size="auto" className="text-xs" onClick={onDismiss}>Dismiss</Button></p>;
}

function runStatus(data: GlossaryList, starting: boolean): string | null {
  const { jobs } = data;
  if (starting) return "Preparing a translation run";
  if (!jobs.total) return null;
  const settled = Math.min(jobs.total, jobs.completed + jobs.exhausted);
  const percent = Math.round(settled / jobs.total * 100);
  const issues = jobs.completedWithRejections + jobs.exhausted;
  return `${jobs.active > 0 ? "Translation running" : "Latest run"}: ${percent}% processed${issues ? `, ${issues.toLocaleString()} need attention` : ""}`;
}

function operationalStatus(data: GlossaryList, starting: boolean, refreshError: string | null): { text: string; failed: boolean } {
  const parts = data.segments.total === 0
    ? ["Nothing has been translated into this language yet"]
    : [`${data.segments.current.toLocaleString()} of ${data.segments.total.toLocaleString()} stored ${data.segments.total === 1 ? "translation" : "translations"} follow the current terms`];
  const runLine = runStatus(data, starting);
  if (runLine) parts.push(runLine);
  if (refreshError) parts.push(`Progress refresh failed: ${refreshError}`);
  return { text: parts.join(" · "), failed: Boolean(refreshError) };
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
