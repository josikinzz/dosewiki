"use client";

import { useMemo } from "react";

import { EditorList, EditorStatusPill } from "@/features/dev/components";
import { INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";
import { portalStatusLabel, type PortalGroup, type PortalRow } from "./tripReportPortalModel";

type ListEntry =
  | { kind: "group"; key: string; name: string; count: number }
  | { kind: "row"; key: string; row: PortalRow };

/**
 * The corpus index, on the shared triage list: one listbox the arrow keys
 * move through (and j/k from the tab), with group headings sitting between
 * rows as dividers the keys skip. Flat hairline rows, no per-row card,
 * because a homogeneous index reads faster as a list than as a grid of slabs.
 *
 * `compact` is the state the list collapses to while the editor is open: the
 * same rows, reduced to title and status so the column can hand its width to
 * the editor without the selection disappearing.
 *
 * Submissions a bulk decision can move carry a checkbox; the tab owns the
 * ticked set and the bulk bar.
 */
export function PortalReportList({
  checkedIds,
  canCheck,
  compact,
  groups,
  maxHeight,
  onSelect,
  onToggleChecked,
  selectedId,
}: {
  checkedIds: ReadonlySet<string>;
  canCheck: (row: PortalRow) => boolean;
  compact: boolean;
  groups: readonly PortalGroup[];
  maxHeight?: string;
  onSelect: (row: PortalRow) => void;
  onToggleChecked: (id: string) => void;
  selectedId: string | null;
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
      estimateRowHeight={compact ? 34 : 56}
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
          <div className="theme-portal-rule flex items-baseline gap-2.5 border-b px-1 pb-1.5">
            <h3 className="theme-portal-group-heading font-display text-xs font-semibold uppercase tracking-[0.16em]">
              {entry.name}
            </h3>
            <span className="text-dose-text-ghost font-mono text-[11px] tabular-nums">{entry.count}</span>
          </div>
        ) : (
          <PortalRowView row={entry.row} compact={compact} selected={selected} />
        )
      }
    />
  );
}

function PortalRowView({ compact, row, selected }: { compact: boolean; row: PortalRow; selected: boolean }) {
  const primary = row.substances[0];
  const extra = row.substances.length - 1;

  return (
    <div
      data-state={selected ? "active" : "idle"}
      className={`theme-portal-row theme-portal-rule grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b text-left transition-colors ${
        compact ? "px-1.5 py-1.5" : "px-1.5 py-2"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {row.statusKind === "needs" ? (
          <span className="theme-portal-needs-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
        ) : null}
        <span
          className={`theme-portal-row-title min-w-0 truncate font-semibold leading-snug ${
            compact ? "text-[13px]" : "text-sm"
          }`}
        >
          {row.title}
        </span>
      </span>

      <span className="flex items-center justify-end gap-1.5">
        <EditorStatusPill tone={INTAKE_STATUS_TONE[row.intakeStatus]}>{portalStatusLabel(row)}</EditorStatusPill>
      </span>

      {compact ? null : (
        <span className="theme-text-faint col-start-1 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs">
          <span className="truncate">{row.subject.name}</span>
          <span className="text-dose-text-ghost">·</span>
          <span className="text-dose-accent-soft truncate">{primary ? primary.name : "–"}</span>
          {primary?.dose ? (
            <span className="theme-text-muted font-mono text-[11px]">
              {primary.dose}
              {primary.roa ? ` · ${primary.roa}` : ""}
            </span>
          ) : null}
          {extra > 0 ? <span className="text-dose-text-ghost">+{extra}</span> : null}
          {row.sortDate ? (
            <>
              <span className="text-dose-text-ghost">·</span>
              <span className="font-mono text-[11px] tabular-nums">{row.sortDate}</span>
            </>
          ) : null}
          {row.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="theme-portal-rule theme-text-muted rounded-full border px-1.5 py-px text-[11px]"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
