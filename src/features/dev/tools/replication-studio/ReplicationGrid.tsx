"use client";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { EditorPanel } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioGroup, StudioRow } from "./replicationStudioModel";

export type ReplicationGridProps = {
  groups: readonly StudioGroup[];
  selection: ReadonlySet<string>;
  onCardActivate: (event: React.MouseEvent, id: string) => void;
};

function ReplicationCard({
  row,
  selected,
  onActivate,
}: {
  row: StudioRow;
  selected: boolean;
  onActivate: (event: React.MouseEvent, id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-id={row.id}
      onClick={(event) => onActivate(event, row.id)}
      data-state={selected ? "active" : undefined}
      className={cn(
        "theme-replication-card group relative flex flex-col gap-2 rounded-xl border p-2 text-left transition",
        selected ? undefined : "border-[color:var(--editor-panel-border)]",
      )}
    >
      <ReplicationThumb row={row} className="aspect-[4/3]" />

      {selected ? (
        <span className="absolute right-3 top-3 inline-flex size-5 items-center justify-center theme-replication-card-check rounded-full">
          <Icon icon="lucide:check" size={13} />
        </span>
      ) : null}

      <div className="min-w-0 space-y-1">
        <div className="theme-text-primary truncate text-sm font-medium">{row.title || "Untitled"}</div>
        <div className="theme-text-faint truncate text-xs">{row.artist}</div>
        <div className="flex flex-wrap items-center gap-1">
          {row.effect_name ? (
            <Badge variant="effect" className="max-w-full truncate">
              {row.effect_name}
            </Badge>
          ) : (
            <Badge variant="outline">No effect</Badge>
          )}
          <Badge variant="secondary">{row.type}</Badge>
          {row.role === "figure" ? <Badge variant="outline">figure</Badge> : null}
          {row.effect_tags.length > 0 ? (
            <Badge variant="secondary">{row.effect_tags.length} tags</Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/** The media grid, optionally split into labelled group runs. */
export function ReplicationGrid({ groups, selection, onCardActivate }: ReplicationGridProps) {
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  if (total === 0) {
    return (
      <EditorPanel variant="empty" className="p-8 text-center text-sm">
        No replications match these filters. Clear a chip above, or drop files anywhere to add one.
      </EditorPanel>
    );
  }

  return (
    <div role="listbox" aria-multiselectable aria-label="Replications" className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          {group.label ? (
            <header className="flex items-baseline gap-3 border-b border-[color:var(--editor-panel-border)] pb-1">
              <h3 className="theme-accent-emphasis font-display text-base font-semibold">{group.label}</h3>
              <span className="theme-text-faint font-mono text-xs">
                {group.rows.length} item{group.rows.length === 1 ? "" : "s"}
              </span>
            </header>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {group.rows.map((row) => (
              <ReplicationCard
                key={row.id}
                row={row}
                selected={selection.has(row.id)}
                onActivate={onCardActivate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
