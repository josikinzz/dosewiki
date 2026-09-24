"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorSegmentedControl, EditorStatusPill } from "@/features/dev/components";
import {
  count,
  glossaryExportUrl,
  STATE_WORD,
  type GlossaryFilters,
  type GlossaryStatusFilter,
} from "./glossaryModel";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const STATUS_OPTIONS: { value: GlossaryStatusFilter; label: string }[] = [
  { value: "draft", label: capitalize(STATE_WORD.draft) },
  { value: "unchecked", label: "Live, never checked" },
  { value: "approved", label: capitalize(STATE_WORD.approved) },
  { value: "all", label: "All" },
];

type GlossaryFilterBarProps = {
  filters: GlossaryFilters;
  setFilters: Dispatch<SetStateAction<GlossaryFilters>>;
  /** Drafts across the whole locale, shown as the draft filter's badge. */
  draftCount: number;
  /** Live rows nobody has checked across the whole locale, shown as that filter's badge. */
  uncheckedCount: number;
  /** Drafts the current filters list, which "Approve all shown" approves. */
  shownDraftCount: number;
  /** Live, never checked rows the current filters list, which "Confirm all shown" confirms. */
  shownUncheckedCount: number;
  locked: boolean;
  onApproveShown: () => void;
  onConfirmShown: () => void;
};

export function GlossaryFilterBar({ filters, setFilters, draftCount, uncheckedCount, shownDraftCount, shownUncheckedCount, locked, onApproveShown, onConfirmShown }: GlossaryFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <EditorSegmentedControl
        label="Status"
        options={STATUS_OPTIONS.map((option) => ({
          ...option,
          badge: option.value === "draft" ? draftCount : option.value === "unchecked" ? uncheckedCount : undefined,
        }))}
        value={filters.status}
        onChange={(value) => setFilters((current) => ({ ...current, status: value as GlossaryStatusFilter }))}
      />
      {/* Sits with the filters it obeys, so "shown" reads as "what these controls show"; the count is the segmented control's badge. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={locked || shownDraftCount === 0}
        aria-label={`Approve all ${count(shownDraftCount, `${STATE_WORD.draft} term`)} shown`}
        onClick={onApproveShown}
      >
        <Icon icon="lucide:check-check" size={14} />
        Approve all shown
      </Button>
      {/* Only where the filters list live, never checked rows, so the drafts view keeps one bulk action. */}
      {shownUncheckedCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          aria-label={`Confirm all ${count(shownUncheckedCount, "live, never checked term")} shown`}
          onClick={onConfirmShown}
        >
          <Icon icon="lucide:badge-check" size={14} />
          Confirm all shown
        </Button>
      ) : null}
    </div>
  );
}

type GlossaryActionBarProps = {
  locale: string;
  locked: boolean;
  /** Drafting calls the model, so only admins see it; retranslation and the main run sit in the Runs panel in Pages. */
  canAdmin: boolean;
  /** The live status pill's text while a write runs, or `null` when idle. */
  activity: string | null;
  onImport: (file: File | undefined) => void;
  onDraft: () => void;
};

export function GlossaryActionBar({
  locale,
  locked,
  canAdmin,
  activity,
  onImport,
  onDraft,
}: GlossaryActionBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Glossary actions">
      <Button asChild variant="outline" size="sm">
        <a href={glossaryExportUrl(locale)} download={`glossary-${locale}.csv`}>
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
          onImport(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => fileInput.current?.click()}>
        <Icon icon="lucide:upload" size={14} />
        Import CSV
      </Button>
      {canAdmin ? (
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={onDraft}>
          <Icon icon="lucide:sparkles" size={14} />
          Draft missing terms
        </Button>
      ) : null}
      {activity ? <EditorStatusPill tone="info" loading live>{activity}</EditorStatusPill> : null}
    </div>
  );
}
