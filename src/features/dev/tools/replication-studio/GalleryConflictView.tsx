"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { EditorPanel } from "@/features/dev/components";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioMediaType } from "./replicationStudioModel";
import type { GalleryConflict, GalleryCurationState } from "./substanceGalleryPortalModel";

export type ConflictWork = {
  slug: string;
  title: string;
  type: StudioMediaType;
  thumbnail_url: string | null;
  url?: string | null;
};

function ConflictList({
  label,
  slugs,
  other,
  workOf,
}: {
  label: string;
  slugs: readonly string[];
  other: readonly string[];
  workOf: (slug: string) => ConflictWork | null;
}) {
  return (
    <div className="space-y-1.5">
      <h5 className="theme-text-secondary text-xs font-medium">{label}</h5>
      {slugs.length === 0 ? (
        <p className="theme-text-faint text-xs">None</p>
      ) : (
        <ol aria-label={label} className="space-y-1.5">
          {slugs.map((slug, index) => {
            const work = workOf(slug);
            const changed = other[index] !== slug;
            return (
              <li key={slug} className="flex items-center gap-2">
                <span className="theme-text-faint w-5 shrink-0 text-right text-xs tabular-nums">
                  {index + 1}
                </span>
                {work ? (
                  <ReplicationThumb row={work} showGlyph={false} className="h-10 w-14 shrink-0" />
                ) : null}
                <span className="theme-text-primary min-w-0 flex-1 truncate text-sm">
                  {work?.title || slug}
                </span>
                {changed ? (
                  <Badge variant="outline" className="shrink-0">
                    {other.includes(slug) ? "Moved" : "Only here"}
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ConflictSide({
  title,
  detail,
  curated,
  removed,
  otherCurated,
  otherRemoved,
  workOf,
}: {
  title: string;
  detail: string;
  curated: readonly string[];
  removed: readonly string[];
  otherCurated: readonly string[];
  otherRemoved: readonly string[];
  workOf: (slug: string) => ConflictWork | null;
}) {
  return (
    <section aria-label={title} className="min-w-0 space-y-3">
      <div>
        <h4 className="theme-text-primary text-sm font-semibold">{title}</h4>
        <p className="theme-text-faint text-xs">{detail}</p>
      </div>
      <ConflictList label="Priority order" slugs={curated} other={otherCurated} workOf={workOf} />
      <ConflictList label="Excluded" slugs={removed} other={otherRemoved} workOf={workOf} />
    </section>
  );
}

export function GalleryConflictView({
  conflict,
  mine,
  workOf,
  actions,
}: {
  conflict: GalleryConflict;
  mine: GalleryCurationState;
  workOf: (slug: string) => ConflictWork | null;
  actions: ReactNode;
}) {
  const savedAt = conflict.updated_at.slice(0, 16).replace("T", " ");
  return (
    <EditorPanel role="region" aria-label="This gallery changed on the server" className="space-y-4 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="theme-text-primary text-sm font-semibold">This gallery changed on the server</h3>
          <p className="theme-text-muted text-xs">
            Someone saved this board after you loaded it. Keep yours to replace theirs, or take theirs to drop your changes.
          </p>
        </div>
        {actions}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ConflictSide
          title="Saved on the server"
          detail={`By ${conflict.updated_by ?? "unknown"}, ${savedAt}`}
          curated={conflict.curated_slugs}
          removed={conflict.removed_slugs}
          otherCurated={mine.curated}
          otherRemoved={mine.removed}
          workOf={workOf}
        />
        <ConflictSide
          title="Your unsaved changes"
          detail="Not saved yet"
          curated={mine.curated}
          removed={mine.removed}
          otherCurated={conflict.curated_slugs}
          otherRemoved={conflict.removed_slugs}
          workOf={workOf}
        />
      </div>
    </EditorPanel>
  );
}
