"use client";

/**
 * Glossary: `/dev/glossary`. The reviewed term list every locale mirror's
 * prompts are held to, one row per (locale, term) in Postgres.
 *
 * The workflow for a locale: draft the missing terms by machine, review each
 * one (approve it as it stands, or type the rendering, which approves it),
 * then start the main translation once nothing is left unreviewed. Afterwards,
 * editing any rendering and pressing "Retranslate" redoes only the stored
 * translations that mention the edited terms; the background job does the
 * rest. Only approved rows reach a prompt, so an unreviewed row changes nothing
 * on the mirror until someone approves it.
 *
 * A single-row write locks only its own row, so a reviewer can keep typing in
 * the next one; after the reload, focus moves to the next unreviewed row so
 * Enter, Enter, Enter walks the list.
 *
 * Under each term sits its definition (gloss): the one-line English meaning
 * the prompt injects beside the approved rendering and the public /glossary
 * page shows. Definitions are locale-independent taxonomy content, so an
 * editor writes them in place here and a translator reads them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorSelect,
  EditorStatusPill,
  LoadErrorState,
  useConfirm,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import {
  approveTerms,
  count,
  DEFAULT_FILTERS,
  draftMissingTerms,
  editTerm,
  fetchGlossary,
  filterRows,
  glossaryExportUrl,
  groupRows,
  GlossaryReviewCollision,
  importGlossaryCsv,
  retranslateTerms,
  saveGloss,
  startMainTranslation,
  STATE_WORD,
  type GlossaryFilters,
  type GlossaryList,
  type GlossaryRow,
  type GlossaryStatusFilter,
} from "./glossaryModel";
import { GlossaryGroupSection } from "./GlossaryReviewTable";
import { PendingTermsList } from "./PendingTermsList";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const STATUS_OPTIONS: { value: GlossaryStatusFilter; label: string }[] = [
  { value: "draft", label: capitalize(STATE_WORD.draft) },
  { value: "approved", label: capitalize(STATE_WORD.approved) },
  { value: "all", label: "All" },
];

/** Writes that lock the whole tab: everything but a single row's approve or save. */
type Busy = "load" | "approve" | "draft" | "retranslate" | "start" | "import" | null;

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
  const canAdmin = roleMeetsFloor(viewerRole, "admin");
  const canDefine = roleMeetsFloor(viewerRole, "editor");
  const [locale, setLocale] = useState<string | null>(null);
  const [data, setData] = useState<GlossaryList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<GlossaryFilters>(DEFAULT_FILTERS);
  const [busy, setBusy] = useState<Busy>(null);
  /** The one row an approve or save is writing; every other row stays editable. */
  const [writing, setWriting] = useState<Writing | null>(null);
  const writingTerm = writing?.term ?? null;
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const handoff = useRef<Handoff | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [collisionReview, setCollisionReview] = useState<CollisionReview | null>(null);
  const collisionReturnFocus = useRef<HTMLElement | null>(null);
  const actionVersion = useRef(0);
  /** What "Retranslate" sends: derived on the server from review and retranslate stamps, so it is the same list after a reload or on another machine. */
  const pending = data?.pending ?? [];
  const { confirm, dialog } = useConfirm();
  const locked = busy !== null || writingTerm !== null || collisionReview !== null;

  const load = useCallback(async (code: string | null) => {
    setLoadError(null);
    try {
      const next = await fetchGlossary(code);
      setData(next);
      setLocale(next.locale);
    } catch (error) {
      setData(null);
      setLoadError(error instanceof Error ? error.message : "Unable to load the glossary.");
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  // Runs once the written row is unlocked and the reload has rendered: the
  // next unreviewed row after the written one takes focus, or the written row
  // itself if nothing follows it, so a reviewer never reaches for the mouse.
  useEffect(() => {
    if (writingTerm !== null || !handoff.current) return;
    const { order, index } = handoff.current;
    handoff.current = null;
    const rows: Record<string, HTMLElement> = {};
    for (const row of document.querySelectorAll<HTMLElement>("tr[data-term]")) rows[row.dataset.term ?? ""] = row;
    const next = order.slice(index + 1).find((term) => rows[term]?.dataset.status === "draft");
    rows[next ?? order[index]]?.querySelector("input")?.focus();
  }, [writingTerm]);

  const rows = useMemo(() => (data ? filterRows(data.rows, filters) : []), [data, filters]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  // Header numerics come from the unfiltered rows, so "34 of 120 unreviewed"
  // keeps meaning the same thing while a search narrows what is listed below.
  const totals = useMemo(() => {
    const byCategory: Record<string, { total: number; draft: number }> = {};
    if (data) for (const group of groupRows(data.rows)) byCategory[group.category.id] = { total: group.rows.length, draft: group.draftCount };
    return byCategory;
  }, [data]);
  const draftCount = data ? data.rows.filter((row) => row.status === "draft").length : 0;
  const shownDrafts = rows.filter((row) => row.status === "draft");
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
      await approveTerms(locale!, [row.term], collisionConfirmation);
      return `Approved "${row.term}".`;
    }, row.term);

  const approveMany = (terms: readonly string[]) =>
    run("approve", async (collisionConfirmation) => {
      const approved = await approveTerms(locale!, terms, collisionConfirmation);
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

  const saveTarget = (row: GlossaryRow, target: string) =>
    run("approve", async (collisionConfirmation) => {
      const saved = await editTerm(locale!, row.term, target, collisionConfirmation);
      return `Saved "${saved.term}" as ${saved.target}; it is approved.`;
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
      description: "Translations that mention these terms will be redone by the background job within about five minutes; everything else keeps its current translation.",
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
      description: "Every public page will be translated for this locale in the background, a few at a time.",
      confirmLabel: "Start translation",
      onConfirm: () =>
        void run("start", async () => {
          const result = await startMainTranslation(locale!);
          return `Queued ${count(result.total, "page")} for translation.`;
        }),
    });

  /** Reads the chosen file here and sends it whole; the server writes all of it or none. */
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const csv = file.text();
    await run("import", async (collisionConfirmation) => {
      const summary = await importGlossaryCsv(locale!, await csv, collisionConfirmation);
      const total = summary.approved + summary.drafts;
      return `Imported ${summary.approved} approved and ${summary.drafts} ${STATE_WORD.draft} ${total === 1 ? "rendering" : "renderings"}.`;
    });
  };

  const changeLocale = (code: string) => {
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
        title="Glossary"
        description="The reviewed term list each locale mirror's prompts are held to. Only approved rows reach a prompt; editing a rendering approves it."
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
                    label: `${option.locale}${option.live ? " (live)" : ""} · ${option.draft} ${STATE_WORD.draft}, ${option.approved} ${STATE_WORD.approved}`,
                  }))}
                  disabled={locked}
                  onChange={(event) => changeLocale(event.target.value)}
                />
              </div>
              <EditorSegmentedControl
                label="Status"
                options={STATUS_OPTIONS.map((option) => ({
                  ...option,
                  badge: option.value === "draft" ? draftCount : undefined,
                }))}
                value={filters.status}
                onChange={(value) => setFilters((current) => ({ ...current, status: value as GlossaryStatusFilter }))}
              />
              <div className="w-full md:w-64">
                <Input
                  type="search"
                  inputSize="sm"
                  aria-label="Search terms"
                  placeholder="Search term or rendering"
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                />
              </div>
              {/* Sits with the filters it obeys, so "shown" reads as "what these controls show"; the count is the segmented control's badge. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked || shownDrafts.length === 0}
                aria-label={`Approve all ${count(shownDrafts.length, `${STATE_WORD.draft} term`)} shown`}
                onClick={approveShown}
              >
                <Icon icon="lucide:check-check" size={14} />
                Approve all shown
              </Button>
            </div>

            <p className="theme-text-faint text-xs" data-testid="glossary-summary">
              {draftCount} {STATE_WORD.draft}, {data.rows.length - draftCount} {STATE_WORD.approved} · {data.segments.current} of {count(data.segments.total, "stored translation")} {data.segments.total === 1 ? "follows" : "follow"} the current terms
            </p>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Glossary actions">
              <Button asChild variant="outline" size="sm">
                <a href={glossaryExportUrl(data.locale)} download={`glossary-${data.locale}.csv`}>
                  <Icon icon="lucide:download" size={14} />
                  Export CSV
                </a>
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                aria-label="Choose a glossary CSV"
                className="sr-only"
                disabled={locked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void importFile(file);
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => fileInput.current?.click()}>
                <Icon icon="lucide:upload" size={14} />
                Import CSV
              </Button>
              {canAdmin ? (
                <Button type="button" variant="outline" size="sm" disabled={locked} onClick={draft}>
                  <Icon icon="lucide:sparkles" size={14} />
                  Draft missing terms
                </Button>
              ) : null}
              {/* Absent, not disabled, until something has been translated: there is nothing to redo. */}
              {!canAdmin || nothingTranslatedYet ? null : (
                <Button
                  type="button"
                  variant={pending.length > 0 ? "accent" : "outline"}
                  size="sm"
                  disabled={locked || pending.length === 0}
                  aria-label={`Retranslate everything that mentions ${count(pending.length, "term")}`}
                  onClick={retranslate}
                >
                  <Icon icon="lucide:languages" size={14} />
                  Retranslate
                </Button>
              )}
              {busy ? (
                <EditorStatusPill tone="info" loading live>{BUSY_LABEL[busy]}</EditorStatusPill>
              ) : writing ? (
                <EditorStatusPill tone="info" loading live>{writing.field === "definition" ? "Saving definition" : `Saving "${writing.term}"`}</EditorStatusPill>
              ) : null}
            </div>
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
                  ? "Nothing has been translated under these terms yet. Starting the main translation translates every public page in the background, a few at a time."
                  : pending.length > 0
                    ? `${count(pending.length, "approved rendering")} ${pending.length === 1 ? "has" : "have"} not reached the stored translations yet. Retranslating redoes only the translations that mention ${pending.length === 1 ? "it" : "them"}.`
                    : "The stored translations already follow these terms. Editing a rendering queues it for a retranslate."}
                compact
                actions={!canAdmin ? undefined : canRetranslate ? (
                  <Button type="button" variant="accent" size="sm" disabled={locked} onClick={retranslate}>
                    <Icon icon="lucide:languages" size={14} />
                    Retranslate
                  </Button>
                ) : (
                  <Button type="button" variant={nothingTranslatedYet ? "accent" : "outline"} size="sm" disabled={locked} onClick={startMain}>
                    <Icon icon="lucide:play" size={14} />
                    {nothingTranslatedYet ? "Start main translation" : "Run the main translation again"}
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
                    totals={totals[group.category.id] ?? { total: group.rows.length, draft: group.draftCount }}
                    statusFilter={filters.status}
                    expanded={!collapsed[group.category.id]}
                    disabled={busy !== null}
                    writingTerm={writingTerm}
                    glosses={data.glosses}
                    canDefine={canDefine}
                    onToggle={() => toggleGroup(group.category.id)}
                    onApproveAll={() => confirmApprove(group.rows.filter((row) => row.status === "draft").map((row) => row.term), group.category.label)}
                    onApprove={(row) => void approveOne(row)}
                    onSave={saveTarget}
                    onSaveDefinition={(row, gloss) => void saveDefinition(row, gloss)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </EditorSection>

      {dialog}
      <Dialog open={collisionReview !== null} onOpenChange={(open) => { if (!open) setCollisionReview(null); }}>
        <DialogContent
          showClose={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            collisionReturnFocus.current?.focus({ preventScroll: true });
          }}
        >
          <DialogHeader>
            <DialogTitle>Allow these terms to share a rendering?</DialogTitle>
            <DialogDescription>
              Nothing was written. These English terms would read the same in {collisionReview?.locale}.
              Allow this only when the shared rendering is appropriate for every listed term.
            </DialogDescription>
          </DialogHeader>
          <ul className="theme-text-secondary max-h-64 space-y-4 overflow-y-auto text-sm">
            {collisionReview?.error.collisions.map((collision) => (
              <li key={`${collision.kind}:${collision.target}`} className="space-y-1">
                <p className="font-medium theme-text-primary">{collision.target}</p>
                <p>{collision.kind} · {collisionReview.locale}</p>
                <p>{collision.terms.join(", ")}</p>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCollisionReview(null)}>Cancel</Button>
            <Button type="button" variant="accent" onClick={() => {
              if (!collisionReview || collisionReview.locale !== locale) return;
              const review = collisionReview;
              setCollisionReview(null);
              void run(review.kind, review.action, review.term, review.error.collisionConfirmation);
            }}>
              Allow shared rendering
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  load: "Loading",
  approve: "Approving",
  draft: "Drafting with the model",
  retranslate: "Queueing the retranslation",
  start: "Queueing every page",
  import: "Importing the file",
};
