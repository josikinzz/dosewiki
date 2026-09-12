"use client";

/**
 * Glossary: `/dev/glossary`. The reviewed term list every locale mirror's
 * prompts are held to, one row per (locale, term) in Postgres.
 *
 * The workflow for a locale: draft the missing terms by machine, review each
 * draft (approve it as it stands, or type the rendering, which approves it),
 * then start the main translation once no draft is left. Afterwards, editing
 * any gloss and pressing "Retranslate affected segments" marks only the
 * stored segments that mention the edited terms and enqueues their records;
 * the five-minute cron does the rest. Only approved rows reach a prompt, so a
 * draft changes nothing on the mirror until someone approves it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorNotice,
  EditorSection,
  EditorSegmentedControl,
  EditorSelect,
  EditorStatusPill,
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
  LoadErrorState,
  useConfirm,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import {
  approveTerms,
  DEFAULT_FILTERS,
  draftMissingTerms,
  editTerm,
  enqueueMainTranslation,
  fetchGlossary,
  filterRows,
  kindsOf,
  retranslateTerms,
  type GlossaryFilters,
  type GlossaryList,
  type GlossaryRow,
  type GlossaryStatusFilter,
} from "./glossaryModel";

const STATUS_OPTIONS: { value: GlossaryStatusFilter; label: string }[] = [
  { value: "draft", label: "Unreviewed" },
  { value: "approved", label: "Approved" },
  { value: "all", label: "All" },
];

type Busy = "load" | "approve" | "edit" | "draft" | "retranslate" | "enqueue" | null;

export function GlossaryTab() {
  const [locale, setLocale] = useState<string | null>(null);
  const [data, setData] = useState<GlossaryList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<GlossaryFilters>(DEFAULT_FILTERS);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  /** Terms approved or edited since the last retranslation: what "Retranslate affected segments" sends. */
  const [changed, setChanged] = useState<string[]>([]);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (code: string | null) => {
    setLoadError(null);
    try {
      const next = await fetchGlossary(code);
      setData(next);
      setLocale(next.locale);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load the glossary.");
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const rows = useMemo(() => (data ? filterRows(data.rows, filters) : []), [data, filters]);
  const kinds = useMemo(() => (data ? kindsOf(data.rows) : []), [data]);
  const draftCount = data ? data.rows.filter((row) => row.status === "draft").length : 0;
  const shownDrafts = rows.filter((row) => row.status === "draft");

  /** Runs one write, reloads the locale, and reports the outcome. */
  const run = useCallback(
    async (kind: Exclude<Busy, null>, action: () => Promise<string>) => {
      if (!locale) return;
      setBusy(kind);
      setNotice(null);
      try {
        const message = await action();
        await load(locale);
        setNotice({ tone: "success", message });
      } catch (error) {
        setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The change did not go through." });
      } finally {
        setBusy(null);
      }
    },
    [load, locale],
  );

  const noteChanged = (terms: readonly string[]) => setChanged((current) => [...new Set([...current, ...terms])]);

  const approve = (terms: readonly string[]) =>
    run("approve", async () => {
      const approved = await approveTerms(locale!, terms);
      noteChanged(approved);
      return approved.length === 1 ? `Approved "${approved[0]}".` : `Approved ${approved.length} term(s).`;
    });

  const approveShown = () => {
    const terms = shownDrafts.map((row) => row.term);
    confirm({
      title: `Approve ${terms.length} shown draft(s)?`,
      description: "Each rendering is approved as it stands and will be injected into every prompt that mentions the term. Rows already approved are unchanged.",
      confirmLabel: "Approve all shown",
      affected: terms,
      onConfirm: () => void approve(terms),
    });
  };

  const saveTarget = (row: GlossaryRow, target: string) =>
    run("edit", async () => {
      const saved = await editTerm(locale!, row.term, target);
      noteChanged([saved.term]);
      return `Saved "${saved.term}" as ${saved.target}; it is approved.`;
    });

  const retranslate = () => {
    const terms = [...changed];
    confirm({
      title: `Retranslate segments mentioning ${terms.length} term(s)?`,
      description: "Stored segments whose English mentions one of these terms are marked stale and their records are enqueued; the translation cron retranslates them within a few minutes. Every other segment is restamped with the new prompt digest, since its prompt does not change.",
      confirmLabel: "Retranslate",
      affected: terms,
      onConfirm: () =>
        void run("retranslate", async () => {
          const result = await retranslateTerms(locale!, terms);
          setChanged([]);
          const jobs = Object.entries(result.jobs).map(([kind, count]) => `${count} ${kind}`).join(", ");
          return `${result.segments} segment(s) marked stale, ${result.restamped} restamped; enqueued ${jobs || "no records"}.`;
        }),
    });
  };

  const draft = () =>
    confirm({
      title: `Draft the missing terms for ${locale}?`,
      description: "Every term the site publishes that this locale has no row for is rendered alone by the model and written as a draft. Existing rows are never touched. This calls the model a few hundred times for a new locale.",
      confirmLabel: "Draft missing terms",
      onConfirm: () =>
        void run("draft", async () => {
          const summary = await draftMissingTerms(locale!);
          setFilters((current) => ({ ...current, status: "draft" }));
          return `Drafted ${summary.drafted} of ${summary.universe - summary.existing} missing term(s); ${summary.flagged} flagged by the validator, ${summary.failed} failed, ${summary.collisions} collision(s) left for review.`;
        }),
    });

  const startMain = () =>
    confirm({
      title: `Start the main translation for ${locale}?`,
      description: "Every public record of every kind is enqueued for this locale. The cron works three records every five minutes; a whole-corpus backfill is faster from a workstation (live-mirror.ts backfill), but this needs no workstation.",
      confirmLabel: "Enqueue every record",
      onConfirm: () =>
        void run("enqueue", async () => {
          const result = await enqueueMainTranslation(locale!);
          const jobs = Object.entries(result.jobs).map(([kind, count]) => `${count} ${kind}`).join(", ");
          return `Enqueued ${result.total} record(s): ${jobs}.`;
        }),
    });

  const changeLocale = (code: string) => {
    setLocale(code);
    setChanged([]);
    setFilters(DEFAULT_FILTERS);
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
          <Button type="button" variant="ghost" size="sm" onClick={() => void load(locale)} disabled={busy !== null}>
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
                    label: `${option.locale}${option.live ? " (live)" : ""} · ${option.draft} draft, ${option.approved} approved`,
                  }))}
                  disabled={busy !== null}
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
              <div className="w-full md:w-48">
                <EditorSelect
                  aria-label="Kind"
                  selectSize="sm"
                  value={filters.kind}
                  options={[{ value: "", label: "Every kind" }, ...kinds.map((kind) => ({ value: kind, label: kind }))]}
                  onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value }))}
                />
              </div>
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
            </div>

            <p className="theme-text-faint text-xs" data-testid="glossary-summary">
              {draftCount} draft, {data.rows.length - draftCount} approved · prompt digest{" "}
              <span className="font-mono">{data.promptVersion}</span> · {data.segments.current} of {data.segments.total} stored segments on it
            </p>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Glossary actions">
              <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={draft}>
                <Icon icon="lucide:sparkles" size={14} />
                Draft missing terms
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy !== null || shownDrafts.length === 0} onClick={approveShown}>
                <Icon icon="lucide:check-check" size={14} />
                Approve all shown ({shownDrafts.length})
              </Button>
              <Button type="button" variant="accent" size="sm" disabled={busy !== null || changed.length === 0} onClick={retranslate}>
                <Icon icon="lucide:languages" size={14} />
                Retranslate affected segments ({changed.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null || draftCount > 0 || data.rows.length === 0}
                title={draftCount > 0 ? `${draftCount} draft term(s) still need review.` : undefined}
                onClick={startMain}
              >
                <Icon icon="lucide:play" size={14} />
                Start main translation
              </Button>
              {busy ? <EditorStatusPill tone="info" loading live>{BUSY_LABEL[busy]}</EditorStatusPill> : null}
            </div>

            {rows.length === 0 ? (
              <StateCard
                tone="neutral"
                icon="lucide:book-a"
                title={data.rows.length === 0 ? "No terms yet" : "Nothing matches these filters"}
                description={data.rows.length === 0 ? "Draft the missing terms to begin the review." : "Widen the status, kind, or search filter."}
                compact
              />
            ) : (
              <GlossaryTable rows={rows} disabled={busy !== null} onApprove={(row) => void approve([row.term])} onSave={saveTarget} />
            )}
          </div>
        )}
      </EditorSection>

      {dialog}
    </div>
  );
}

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  load: "Loading",
  approve: "Approving",
  edit: "Saving",
  draft: "Drafting with the model",
  retranslate: "Marking segments and enqueuing",
  enqueue: "Enqueuing every record",
};

type GlossaryTableProps = {
  rows: GlossaryRow[];
  disabled: boolean;
  onApprove: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string) => void;
};

function GlossaryTable({ rows, disabled, onApprove, onSave }: GlossaryTableProps) {
  return (
    <EditorTable className="md:min-w-[56rem]">
      <EditorTableHead>
        <EditorTableHeading>Term</EditorTableHeading>
        <EditorTableHeading>Kind</EditorTableHeading>
        <EditorTableHeading>Rendering</EditorTableHeading>
        <EditorTableHeading>Status</EditorTableHeading>
        <EditorTableHeading>Source</EditorTableHeading>
        <EditorTableHeading>Actions</EditorTableHeading>
      </EditorTableHead>
      <EditorTableBody>
        {rows.map((row) => (
          <GlossaryTableRow key={row.term} row={row} disabled={disabled} onApprove={onApprove} onSave={onSave} />
        ))}
      </EditorTableBody>
    </EditorTable>
  );
}

type GlossaryTableRowProps = {
  row: GlossaryRow;
  disabled: boolean;
  onApprove: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string) => void;
};

function GlossaryTableRow({ row, disabled, onApprove, onSave }: GlossaryTableRowProps) {
  const [draft, setDraft] = useState(row.target);
  useEffect(() => setDraft(row.target), [row.target]);
  const dirty = draft.trim() !== row.target && draft.trim().length > 0;
  const save = () => {
    if (dirty) onSave(row, draft.trim());
  };
  return (
    <EditorTableRow data-term={row.term}>
      <EditorTableCell wide>
        <span className="block font-medium theme-text-primary">{row.term}</span>
      </EditorTableCell>
      <EditorTableCell label="Kind" className="theme-text-secondary text-xs">
        {row.kind}
      </EditorTableCell>
      <EditorTableCell label="Rendering" wide>
        <Input
          inputSize="sm"
          aria-label={`Rendering for ${row.term}`}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
      </EditorTableCell>
      <EditorTableCell label="Status">
        {row.status === "approved" ? (
          <EditorStatusPill tone="success">Approved</EditorStatusPill>
        ) : (
          <EditorStatusPill tone="warning">Draft</EditorStatusPill>
        )}
      </EditorTableCell>
      <EditorTableCell label="Source" className="theme-text-secondary text-xs">
        {row.source === "human" ? (row.reviewed_by ?? "human") : "model"}
      </EditorTableCell>
      <EditorTableCell>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Actions for ${row.term}`}>
          <Button type="button" variant="accent" size="sm" disabled={disabled || !dirty} onClick={save}>
            <Icon icon="lucide:save" size={14} />
            Save
          </Button>
          {row.status === "draft" ? (
            <Button type="button" variant="outline" size="sm" disabled={disabled || dirty} onClick={() => onApprove(row)}>
              <Icon icon="lucide:check" size={14} />
              Approve
            </Button>
          ) : null}
        </div>
      </EditorTableCell>
    </EditorTableRow>
  );
}
