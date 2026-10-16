"use client";

import { useMemo } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { EditorPanel } from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";

import { ReplicationAssociationsPanel } from "./ReplicationAssociationsPanel";
import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioRow } from "./replicationStudioModel";

export function ReplicationPlacementWorkspace({
  row,
  rows,
  onChooseRow,
  onOpenInLibrary,
  onDirtyChange,
}: {
  row: StudioRow | null;
  rows: readonly StudioRow[];
  onChooseRow: (id: string) => void;
  onOpenInLibrary: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const options = useMemo(
    () => rows.map((entry) => ({ value: entry.id, label: entry.title || "Untitled", hint: entry.artist })),
    [rows],
  );

  return (
    <div className="space-y-4">
      <EditorPanel className="flex flex-wrap items-center gap-4 px-4 py-3">
        {row ? <ReplicationThumb row={row} showGlyph={false} className="h-14 w-20 shrink-0" /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="theme-text-primary truncate font-display text-base font-semibold">
            {row ? row.title || "Untitled" : "Choose a work"}
          </h3>
          <p className="theme-text-faint truncate text-xs">
            {row
              ? [row.artist, row.effect_name ?? "No effect"].join(" · ")
              : "See every drug article it can appear on, pin it directly, or exclude it."}
          </p>
        </div>
        <div className="w-full sm:w-72">
          <SearchablePicker
            ariaLabel="Choose a replication"
            placeholder={row ? "Switch to another work" : "Search works by title or artist"}
            emptyText="No work matches."
            options={options}
            value={row?.id ?? null}
            onChange={(value) => {
              if (value) onChooseRow(value);
            }}
          />
        </div>
        {row ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenInLibrary(row.id)}>
            <Icon icon="lucide:library" size={15} />
            Edit details
          </Button>
        ) : null}
      </EditorPanel>

      {row ? (
        <ReplicationAssociationsPanel key={row.id} row={row} onDirtyChange={onDirtyChange} />
      ) : (
        <EmptyStateSurface padding="sm" radius="lg" className="theme-text-muted text-sm">
          Pick a work above, or select one in the Library and choose Manage in Showcases.
        </EmptyStateSurface>
      )}
    </div>
  );
}
