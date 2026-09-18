"use client";

/**
 * The curation portal's article preview: the real Replication Showcase, fed
 * the order the editor is currently arranging.
 *
 * Nothing here re-implements the stage. Letterboxing, the video-first
 * behaviour, the thumbnail tablist, the `+N` overflow tile and broken-media
 * placeholders all come from the shipped component, so a preview that looks
 * right *is* an article that looks right. The only local decisions are the
 * cap slice (mirroring the article's caller), the labelled disclosure, and a
 * width clamp so the stage reads as a figure inside the editor rather than as
 * the page itself.
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { EditorSection, EditorStatusPill } from "@/features/dev/components";
import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import { previewWorksFromMatches } from "./galleryPreviewModel";
import type { GalleryMatch } from "./substanceGalleryPortalModel";

export function GalleryStagePreview({
  matches,
}: {
  matches: readonly GalleryMatch[];
}) {
  /**
   * Open by default: seeing the article is the point of this surface, not a
   * reward for finding a toggle. The disclosure exists only so an editor
   * working a long board can reclaim the vertical space.
   */
  const [open, setOpen] = useState(true);
  const works = useMemo(() => previewWorksFromMatches(matches), [matches]);
  const onStage = works.slice(0, SHOWCASE_WORK_CAP);
  const overflow = works.length - onStage.length;

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:monitor-play"
      title="Article preview"
      description="The live Replication Showcase, exactly as this substance's article will draw it: same stage, same cap, same overflow link. It shows the curated works and nothing else, because that is all the article publishes."
      animate={false}
      actions={
        <>
          <EditorStatusPill tone="neutral">
            {onStage.length} on stage
            {overflow > 0 ? ` · +${overflow} in the gallery` : ""}
          </EditorStatusPill>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((previous) => !previous)}
          >
            <Icon
              icon={open ? "lucide:chevron-down" : "lucide:chevron-right"}
              size={14}
            />
            {open ? "Hide preview" : "Show preview"}
          </Button>
        </>
      }
    >
      {open ? (
        <div className="max-w-[46rem]">
          {works.length === 0 ? (
            <EmptyStateSurface
              padding="md"
              radius="lg"
              className="theme-text-muted text-sm"
            >
              Nothing is curated yet, so the article shows no showcase — this is
              where every substance starts. Curate a matched work and the stage
              appears here as soon as one image or video is on it.
            </EmptyStateSurface>
          ) : (
            <ReplicationShowcase works={onStage} totalCount={works.length} />
          )}
        </div>
      ) : null}
    </EditorSection>
  );
}
