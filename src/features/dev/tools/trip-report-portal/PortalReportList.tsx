"use client";

import { EditorStatusPill, type EditorStatusPillTone } from "@/features/dev/components";
import {
  PORTAL_STATUS_LABELS,
  type PortalGroup,
  type PortalRow,
  type PortalStatusKind,
} from "./tripReportPortalModel";

const STATUS_TONE: Record<PortalStatusKind, EditorStatusPillTone> = {
  needs: "caution",
  published: "success",
  accepted: "info",
  rejected: "danger",
};

/**
 * The corpus index. Flat hairline rows sitting directly on the canvas — no
 * per-row card — because a homogeneous index list reads faster as a list than
 * as a grid of slabs, and the tool this replaced lost the corpus inside one.
 *
 * `compact` is the state the list collapses to while the editor is open: the
 * same rows, reduced to title and status so the column can hand its width to
 * the editor without the selection disappearing.
 */
export function PortalReportList({
  compact,
  groups,
  onSelect,
  selectedId,
}: {
  compact: boolean;
  groups: readonly PortalGroup[];
  onSelect: (row: PortalRow) => void;
  selectedId: string | null;
}) {
  const total = groups.reduce((count, group) => count + group.rows.length, 0);

  if (total === 0) {
    return (
      <p className="theme-text-faint px-4 py-14 text-center text-sm">
        No reports match these filters.
      </p>
    );
  }

  return (
    <div role="listbox" aria-label="Trip reports">
      {groups.map((group) => (
        <div key={group.name ?? "__all__"}>
          {group.name ? (
            <div className="theme-portal-rule flex items-baseline gap-2.5 border-b px-1 pb-1.5 pt-4">
              <h3 className="theme-portal-group-heading font-display text-xs font-semibold uppercase tracking-[0.16em]">
                {group.name}
              </h3>
              <span className="text-dose-text-ghost font-mono text-[11px] tabular-nums">
                {group.rows.length}
              </span>
            </div>
          ) : null}
          {group.rows.map((row) => (
            <PortalRowButton
              key={row.slug}
              row={row}
              compact={compact}
              selected={selectedId === row.id}
              onSelect={() => onSelect(row)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PortalRowButton({
  compact,
  onSelect,
  row,
  selected,
}: {
  compact: boolean;
  onSelect: () => void;
  row: PortalRow;
  selected: boolean;
}) {
  const primary = row.substances[0];
  const extra = row.substances.length - 1;

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-state={selected ? "active" : "idle"}
      onClick={onSelect}
      className={`theme-portal-row theme-portal-rule grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b text-left transition-colors ${
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
        <EditorStatusPill tone={STATUS_TONE[row.statusKind]}>
          {PORTAL_STATUS_LABELS[row.statusKind]}
        </EditorStatusPill>
      </span>

      {compact ? null : (
        <span className="theme-text-faint col-start-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="truncate">{row.subject.name}</span>
          <span className="text-dose-text-ghost">·</span>
          <span className="text-dose-accent-soft truncate">{primary ? primary.name : "—"}</span>
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
    </button>
  );
}
