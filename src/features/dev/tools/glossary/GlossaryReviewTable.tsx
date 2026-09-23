"use client";

import { useEffect, useId, useRef, useState } from "react";

import { GlossaryUsageDisclosure } from "@/components/glossary/GlossaryUsageDisclosure";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import {
  EditorStatusPill,
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
} from "@/features/dev/components";
import {
  count,
  kindLabel,
  STATE_WORD,
  type GlossaryGroup,
  type GlossaryRow,
  type GlossaryStatusFilter,
} from "./glossaryModel";

import { TranslationHistory, translationRequest } from "./TranslationHistory";
import type { ReviewHistoryEntry } from "@lib/translation/reviewTypes";
import type { GlossaryUsageMap, GlossaryUsageResponse } from "@/lib/glossary/glossaryUsage";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export type GlossaryGroupSectionProps = {
  group: GlossaryGroup;
  /** Category counts from the unfiltered rows, so the header keeps its meaning while a search narrows the list. */
  totals: { total: number; draft: number };
  statusFilter: GlossaryStatusFilter;
  expanded: boolean;
  /** A whole-tab write is in flight; every row locks. */
  disabled: boolean;
  /** The one row a single-row write is locking, if any. */
  writingTerm: string | null;
  /** Term to definition, locale-independent. */
  glosses: Readonly<Record<string, string>>;
  /** Source locations computed with the glossary payload, before a disclosure opens. */
  usages: GlossaryUsageMap;
  /** The viewer may write definitions (editor and up); otherwise they read as plain text. */
  canDefine: boolean;
  onToggle: () => void;
  onApproveAll: () => void;
  onApprove: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string) => void;
  onSaveDefinition: (row: GlossaryRow, gloss: string) => void;
  onRestored: () => Promise<void>;
};

/**
 * One category of terms behind one header. The header carries the one number
 * a reviewer scans for before opening anything: how much of this category
 * still needs a decision, out of how much there is. Approving the whole group
 * lives on the header too, so a category that was drafted well can be cleared
 * in one confirmed step; the confirm names the category, the button does not
 * have to.
 */
export function GlossaryGroupSection({ group, totals, statusFilter, expanded, disabled, writingTerm, glosses, usages, canDefine, onToggle, onApproveAll, onApprove, onSave, onSaveDefinition, onRestored }: GlossaryGroupSectionProps) {
  const bodyId = useId();
  const { category, rows } = group;
  const draftCount = rows.filter((row) => row.status === "draft").length;
  const standing = totals.draft > 0
    ? `${totals.draft} of ${totals.total} ${STATE_WORD.draft}`
    : count(totals.total, "term");
  return (
    <Surface variant="subtle" padding="none" radius="lg" data-testid={`glossary-group-${category.id}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <ExpandButton
          variant="inline"
          className="min-h-11 gap-2 text-left text-sm font-semibold"
          isExpanded={expanded}
          onToggle={onToggle}
          label={category.label}
          ariaLabel={`${category.label}: ${standing}`}
          ariaControls={bodyId}
        />
        <span className="theme-text-faint flex-1 text-xs tabular-nums">{standing}</span>
        {/* A "Reviewed" pill only where a reviewed category can be seen at all; under Unreviewed it can never appear. */}
        {totals.draft === 0 && statusFilter === "all" ? <EditorStatusPill tone="success">Reviewed</EditorStatusPill> : null}
        {draftCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || writingTerm !== null}
            aria-label={`Approve all ${count(draftCount, `${STATE_WORD.draft} term`)} in ${category.label}`}
            onClick={onApproveAll}
          >
            <Icon icon="lucide:check-check" size={14} />
            Approve all
          </Button>
        ) : null}
      </div>
      <div id={bodyId} hidden={!expanded} className="px-3 pb-3">
        <GlossaryTable rows={rows} disabled={disabled} writingTerm={writingTerm} glosses={glosses} usages={usages} canDefine={canDefine} onApprove={onApprove} onSave={onSave} onSaveDefinition={onSaveDefinition} onRestored={onRestored} />
      </div>
    </Surface>
  );
}

type GlossaryTableProps = {
  rows: GlossaryRow[];
  disabled: boolean;
  writingTerm: string | null;
  glosses: Readonly<Record<string, string>>;
  usages: GlossaryUsageMap;
  canDefine: boolean;
  onApprove: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string) => void;
  onSaveDefinition: (row: GlossaryRow, gloss: string) => void;
  onRestored: () => Promise<void>;
};

function GlossaryTable({ rows, disabled, writingTerm, glosses, usages, canDefine, onApprove, onSave, onSaveDefinition, onRestored }: GlossaryTableProps) {
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
          <GlossaryTableRow
            key={row.term}
            row={row}
            gloss={glosses[row.term]}
            usage={usages[row.term]}
            canDefine={canDefine}
            disabled={disabled}
            writing={writingTerm === row.term}
            onApprove={onApprove}
            onSave={onSave}
            onSaveDefinition={onSaveDefinition} onRestored={onRestored}
          />
        ))}
      </EditorTableBody>
    </EditorTable>
  );
}

type GlossaryTableRowProps = {
  row: GlossaryRow;
  /** The term's definition, absent until an editor writes one. */
  gloss: string | undefined;
  usage: GlossaryUsageResponse | undefined;
  canDefine: boolean;
  disabled: boolean;
  /** This row's own write is in flight: the input reads only, the buttons wait, focus stays. */
  writing: boolean;
  onApprove: (row: GlossaryRow) => void;
  onSave: (row: GlossaryRow, target: string) => void;
  onSaveDefinition: (row: GlossaryRow, gloss: string) => void;
  onRestored: () => Promise<void>;
};

function GlossaryTableRow({ row, gloss, usage, canDefine, disabled, writing, onApprove, onSave, onSaveDefinition, onRestored }: GlossaryTableRowProps) {
  const [draft, setDraft] = useState(row.target);
  useEffect(() => setDraft(row.target), [row.target]);
  const dirty = draft.trim() !== row.target && draft.trim().length > 0;
  const held = disabled || writing;
  const canSave = draft.trim().length > 0 && (dirty || row.review_provenance === "legacy_unverified");
  const save = () => {
    if (canSave) onSave(row, draft.trim());
  };
  // Enter only saves drafts. Approval always uses the explicit review button.
  const submit = () => {
    if (held) return;
    if (dirty) save();

  };
  return (
    <EditorTableRow data-term={row.term} data-status={row.status} aria-busy={writing || undefined}>
      <EditorTableCell wide>
        <span className="block font-medium theme-text-primary">{row.term}</span>
        {canDefine ? (
          <GlossaryDefinition term={row.term} gloss={gloss} held={held} onSave={(next) => onSaveDefinition(row, next)} />
        ) : gloss ? (
          <span className="theme-text-secondary block text-xs">{gloss}</span>
        ) : null}
        <GlossaryUsageDisclosure term={row.term} initialData={usage} />
        <TranslationHistory revision={row.revision} name={row.term} disabled={held || dirty}
          load={async () => (await translationRequest<{ history: ReviewHistoryEntry[] }>(`/api/dev/translation-glossary/history?locale=${encodeURIComponent(row.locale)}&term=${encodeURIComponent(row.term)}`)).history}
          restore={async (restoreRevision) => {
            await translationRequest("/api/dev/translation-glossary/history", { locale: row.locale, term: row.term, expectedRevision: row.revision, restoreRevision });
            await onRestored();
          }} />
      </EditorTableCell>
      <EditorTableCell label="Kind" className="theme-text-secondary text-xs">
        {kindLabel(row.kind)}
      </EditorTableCell>
      <EditorTableCell label="Rendering" wide>
        <Input
          inputSize="sm"
          aria-label={`Rendering for ${row.term}`}
          aria-busy={writing || undefined}
          value={draft}
          disabled={disabled}
          readOnly={writing}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </EditorTableCell>
      <EditorTableCell label="Status">
        {row.approved_target && row.status === "draft" ? <p className="theme-text-secondary mb-1 text-xs">Approved wording: {row.approved_target}</p> : null}
        <EditorStatusPill tone={row.status === "approved" && row.review_provenance !== "legacy_unverified" ? "success" : "warning"}>{row.review_provenance === "legacy_unverified" && row.status === "approved" ? "Review unverified" : capitalize(STATE_WORD[row.status])}</EditorStatusPill>
        {row.review_provenance === "legacy_unverified" && row.status === "approved" ? <p className="theme-text-faint mt-1 text-xs">Save as a draft to review this wording.</p> : null}
      </EditorTableCell>
      <EditorTableCell label="Source" className="theme-text-secondary text-xs">
        {row.review_provenance === "legacy_unverified" ? "Legacy import, review unverified" : row.source === "human" ? (row.reviewed_by ?? "human") : "model"}
      </EditorTableCell>
      <EditorTableCell>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Actions for ${row.term}`}>
          <Button type="button" variant="outline" size="sm" disabled={held || !canSave} onClick={save}>
            <Icon icon="lucide:save" size={14} />
            Save draft
          </Button>
          {row.status === "draft" ? (
            <Button type="button" variant="outline" size="sm" disabled={held || dirty} onClick={() => onApprove(row)}>
              <Icon icon="lucide:check" size={14} />
              Approve
            </Button>
          ) : null}
        </div>
      </EditorTableCell>
    </EditorTableRow>
  );
}

type GlossaryDefinitionProps = {
  term: string;
  gloss: string | undefined;
  /** The row is locked by a write; the definition cannot be opened for editing. */
  held: boolean;
  onSave: (gloss: string) => void;
};

/**
 * The definition under a term, for an editor: the text is a button that
 * swaps in a one-line input. Enter saves a changed, non-empty definition;
 * Escape or leaving the field puts the text back unchanged. The server
 * decides what is too long or empty, and its message lands in the notice.
 */
function GlossaryDefinition({ term, gloss, held, onSave }: GlossaryDefinitionProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  if (editing) {
    return (
      <Input
        ref={input}
        inputSize="sm"
        className="mt-1"
        aria-label={`Definition for ${term}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const next = draft.trim();
            setDraft(null);
            if (next.length > 0 && next !== gloss) onSave(next);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
          }
        }}
      />
    );
  }
  return (
    <Button
      type="button"
      variant="quiet"
      size="auto"
      className={`block whitespace-normal text-left text-xs font-normal ${gloss ? "theme-text-secondary" : ""}`}
      aria-label={`Edit definition for ${term}`}
      disabled={held}
      onClick={() => setDraft(gloss ?? "")}
    >
      {gloss ?? "No definition yet"}
    </Button>
  );
}
