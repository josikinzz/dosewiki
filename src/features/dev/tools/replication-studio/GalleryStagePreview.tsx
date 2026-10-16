"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
} from "@/features/dev/components";
import { ArticlePreviewFrame } from "@/features/dev/components/ArticlePreviewFrame";
import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import { previewWorksFromMatches } from "./galleryPreviewModel";
import type { GalleryMatch } from "./substanceGalleryPortalModel";

type PreviewView = "stage" | "article";

export function GalleryStagePreview({
  matches,
  substanceSlug = null,
}: {
  matches: readonly GalleryMatch[];
  substanceSlug?: string | null;
}) {
  const [view, setView] = useState<PreviewView>("stage");
  const [open, setOpen] = useState(true);
  const works = useMemo(() => previewWorksFromMatches(matches), [matches]);
  const onStage = works.slice(0, SHOWCASE_WORK_CAP);
  const overflow = works.length - onStage.length;

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:monitor-play"
      title="Article preview"
      description={`The live Replication Showcase as this substance's article will draw it once saved: the first ${SHOWCASE_WORK_CAP} images and videos in the effective order, automatic placements and curation together, on the same stage with the same overflow link.`}
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
        <div className="space-y-3">
          {substanceSlug ? (
            <EditorSegmentedControl
              label="Preview view"
              value={view}
              onChange={(next) => setView(next === "article" ? "article" : "stage")}
              options={[
                { value: "stage", label: "Stage", icon: "lucide:gallery-horizontal" },
                { value: "article", label: "In the article", icon: "lucide:file-text" },
              ]}
            />
          ) : null}
          {substanceSlug && view === "article" ? (
            <ArticlePreviewFrame
              label="Showcase preview"
              slug={substanceSlug}
              draft={{
                showcase:
                  works.length > 0 ? (
                    <ReplicationShowcase
                      works={onStage}
                      collectionWorks={works}
                      totalCount={works.length}
                      substanceSlug={substanceSlug}
                    />
                  ) : null,
              }}
            />
          ) : (
            <div className="max-w-[46rem]">
              {works.length === 0 ? (
                <EmptyStateSurface
                  padding="md"
                  radius="lg"
                  className="theme-text-muted text-sm"
                >
                  No image or video is placed on this article, so it shows no
                  showcase. The stage appears here as soon as an automatic
                  placement or a curated work puts one on the board.
                </EmptyStateSurface>
              ) : (
                <ReplicationShowcase works={onStage} totalCount={works.length} />
              )}
            </div>
          )}
        </div>
      ) : null}
    </EditorSection>
  );
}
