"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorSegmentedControl, EditorStatusPill } from "@/features/dev/components";
import {
  glossaryExportUrl,
  STATE_WORD,
  type GlossaryFilters,
  type GlossaryStatusFilter,
} from "./glossaryModel";

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const STATUS_OPTIONS: { value: GlossaryStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: capitalize(STATE_WORD.draft) },
  { value: "unchecked", label: "Live, never checked" },
  { value: "approved", label: capitalize(STATE_WORD.approved) },
];

type GlossaryFilterBarProps = {
  filters: GlossaryFilters;
  setFilters: Dispatch<SetStateAction<GlossaryFilters>>;
  /** Drafts across the whole locale, shown as the draft filter's badge. */
  draftCount: number;
  /** Live rows nobody has checked across the whole locale, shown as that filter's badge. */
  uncheckedCount: number;
};

/** Which review states the category lists show. Bulk actions live on each category's header, beside the rows they touch. */
export function GlossaryFilterBar({ filters, setFilters, draftCount, uncheckedCount }: GlossaryFilterBarProps) {
  return (
    <EditorSegmentedControl
      label="Status"
      options={STATUS_OPTIONS.map((option) => ({
        ...option,
        badge: option.value === "draft" ? draftCount : option.value === "unchecked" ? uncheckedCount : undefined,
      }))}
      value={filters.status}
      onChange={(value) => setFilters((current) => ({ ...current, status: value as GlossaryStatusFilter }))}
    />
  );
}

type GlossaryActionBarProps = {
  locale: string;
  locked: boolean;
  /** Drafting calls the model, so only admins see it; retranslation and the main run sit in the Runs panel in Articles. */
  canAdmin: boolean;
  /** The live status pill's text while a write runs, or `null` when idle. */
  activity: string | null;
  onImport: (file: File | undefined) => void;
  onDraft: () => void;
};

/**
 * The occasional file and model actions, folded into one menu so the list of
 * terms stays the first thing a reviewer reads. The status pill stays outside
 * it, so a running write is always visible.
 */
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
    <div className="flex items-center gap-2" role="group" aria-label="Glossary actions">
      {activity ? <EditorStatusPill tone="info" loading live>{activity}</EditorStatusPill> : null}
      {/* Outside the menu, which unmounts its items on close. */}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Icon icon="lucide:ellipsis" size={14} />
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuItem asChild>
            <a href={glossaryExportUrl(locale)} download={`glossary-${locale}.csv`}>
              <Icon icon="lucide:download" size={14} className="mr-2" />
              Export CSV
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={locked} onSelect={() => fileInput.current?.click()}>
            <Icon icon="lucide:upload" size={14} className="mr-2" />
            Import CSV
          </DropdownMenuItem>
          {canAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={locked} onSelect={onDraft}>
                <Icon icon="lucide:sparkles" size={14} className="mr-2" />
                Draft missing terms
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
