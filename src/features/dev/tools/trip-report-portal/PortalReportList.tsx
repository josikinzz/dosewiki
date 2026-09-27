"use client";

import { useMemo } from "react";

import { EditorList, EditorListRow, EditorStatusPill } from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import { INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";
import { cn } from "@/lib/utils";
import { formatTripDate } from "../my-reports/myReportsModel";
import { portalStatusLabel, type PortalGroup, type PortalRow } from "./tripReportPortalModel";

type ListEntry =
  | { kind: "group"; key: string; name: string; count: number }
  | { kind: "row"; key: string; row: PortalRow };

/** Every row and group heading shares this pitch; the windowed list sizes itself from one row. */
const ROW_HEIGHT_CLASS = "h-[3.75rem]";
const ROW_PITCH = 64;

/**
 * The corpus index, on the shared triage list: one listbox the arrow keys
 * move through (and j/k from the tab), with group headings sitting between
 * rows at a row's pitch, which the keys skip.
 *
 * A row reads in two lines: the title (and its status when the list spans
 * statuses), then the byline, the first substance and its dose, and when the
 * row arrived (a submission) or the trip happened (a report). A submission
 * that became a report says so, so it is never mistaken for the report.
 *
 * Submissions a bulk decision can move carry a checkbox; the tab owns the
 * ticked set and the bulk bar.
 */
export function PortalReportList({
  checkedIds,
  canCheck,
  groups,
  maxHeight,
  onSelect,
  onToggleChecked,
  selectedId,
  showStatus,
  dirtyId,
}: {
  checkedIds: ReadonlySet<string>;
  canCheck: (row: PortalRow) => boolean;
  groups: readonly PortalGroup[];
  maxHeight?: string;
  onSelect: (row: PortalRow) => void;
  onToggleChecked: (id: string) => void;
  selectedId: string | null;
  /** Whether each row carries its status pill (the list spans statuses). */
  showStatus: boolean;
  /** The open report with unsaved edits, marked with the unsaved dot. */
  dirtyId?: string | null;
}) {
  const entries = useMemo<ListEntry[]>(
    () =>
      groups.flatMap((group) => [
        ...(group.name
          ? [{ kind: "group" as const, key: `group:${group.name}`, name: group.name, count: group.rows.length }]
          : []),
        ...group.rows.map((row) => ({ kind: "row" as const, key: row.slug, row })),
      ]),
    [groups],
  );
  const rowByKey = useMemo(
    () => new Map(entries.flatMap((entry) => (entry.kind === "row" ? [[entry.key, entry.row] as const] : []))),
    [entries],
  );
  const selectedKey = entries.find((entry) => entry.kind === "row" && entry.row.id === selectedId)?.key ?? null;
  // Checked state is kept by id; the list keys rows by their namespaced slug.
  const checkedKeys = useMemo(
    () => new Set(entries.flatMap((entry) => (entry.kind === "row" && checkedIds.has(entry.row.id) ? [entry.key] : []))),
    [checkedIds, entries],
  );

  return (
    <EditorList
      label="Trip reports"
      items={entries}
      getKey={(entry) => entry.key}
      isOption={(entry) => entry.kind === "row"}
      selectedKey={selectedKey}
      onSelect={(key) => {
        const row = rowByKey.get(key);
        if (row) onSelect(row);
      }}
      maxHeight={maxHeight}
      estimateRowHeight={ROW_PITCH}
      emptyText="No reports match these filters."
      multiSelect={{
        checkedKeys,
        onToggle: (key) => {
          const row = rowByKey.get(key);
          if (row) onToggleChecked(row.id);
        },
        checkLabel: (entry) => `Select ${entry.kind === "row" ? entry.row.title : entry.name}`,
        canCheck: (entry) => entry.kind === "row" && canCheck(entry.row),
      }}
      renderItem={(entry, { selected }) =>
        entry.kind === "group" ? (
          <div className={cn("theme-portal-rule flex items-end gap-2.5 border-b px-1 pb-1.5", ROW_HEIGHT_CLASS)}>
            <h3 className="type-meta-label theme-text-muted min-w-0 truncate">{entry.name}</h3>
            <span className="theme-text-faint text-xs tabular-nums">
              <span className="sr-only">, </span>
              {entry.count}
            </span>
          </div>
        ) : (
          <PortalRowView
            row={entry.row}
            selected={selected}
            showStatus={showStatus}
            dirty={dirtyId === entry.row.id}
          />
        )
      }
    />
  );
}

function PortalRowView({
  row,
  selected,
  showStatus,
  dirty,
}: {
  row: PortalRow;
  selected: boolean;
  showStatus: boolean;
  dirty: boolean;
}) {
  const primary = row.substances[0];
  const extra = row.substances.length - 1;
  const submission = row.origin === "submission";
  const waiting = submission && (row.statusKind === "needs" || row.statusKind === "accepted");
  const day = submission ? describeDay(row.receivedAt) : null;
  const tripDate = row.subject.trip_date;
  const substance = primary
    ? `${primary.name}${primary.dose ? ` ${primary.dose}` : ""}${extra > 0 ? ` +${extra}` : ""}`
    : "No substance listed";
  const byline = row.subject.name.trim() || "No byline";

  return (
    <EditorListRow active={selected} className={cn(ROW_HEIGHT_CLASS, "items-start overflow-hidden py-2")}>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-3">
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold",
              selected ? "theme-accent-heading" : "theme-text-primary",
            )}
          >
            {dirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" /> : null}
            <span className="truncate">{row.title || "Untitled report"}</span>
            {dirty ? <span className="sr-only">, unsaved changes</span> : null}
          </span>
          {showStatus || (submission && row.status === "exported") ? (
            <span className="shrink-0">
              <span className="sr-only">, </span>
              <EditorStatusPill inline tone={INTAKE_STATUS_TONE[row.intakeStatus]}>
                {portalStatusLabel(row)}
              </EditorStatusPill>
            </span>
          ) : null}
        </span>
        <span className="theme-text-muted block truncate text-xs">
          <span className="sr-only">, </span>
          {submission && row.status === "exported" ? <span className="theme-text-secondary">Submission · </span> : null}
          <span className="theme-text-secondary font-medium">{byline}</span>
          {` · ${substance}`}
          {day ? (
            <>
              {" · "}
              {waiting ? "Waiting since " : "Received "}
              <time dateTime={row.receivedAt} title={day.full}>
                {day.relative}
              </time>
            </>
          ) : tripDate ? (
            ` · Trip ${formatTripDate(tripDate)}`
          ) : null}
        </span>
      </span>
    </EditorListRow>
  );
}
