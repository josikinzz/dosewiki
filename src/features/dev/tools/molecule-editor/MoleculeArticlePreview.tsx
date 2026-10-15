"use client";

import { useId, useState } from "react";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { ArticlePreviewFrame } from "@/features/dev/components/ArticlePreviewFrame";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export function MoleculeArticlePreview({
  slug,
  svg,
}: {
  slug: string;
  svg: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const regionId = useId();
  const headingId = useId();
  const narrow = useMediaQuery("(max-width: 767px)");

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="space-y-1">
          <h4 id={headingId} className="theme-text-primary text-base font-semibold">In the article</h4>
          <p className="theme-text-muted max-w-[70ch] text-sm">
            The drawing on the canvas inside the real article page, before it goes live.
          </p>
        </div>
        <ExpandButton
          variant="chip"
          isExpanded={open}
          onToggle={() => setOpen((value) => !value)}
          label={open ? "Hide article preview" : "Preview in the article"}
          ariaLabel={open ? "Hide article preview" : "Preview in the article"}
          ariaControls={regionId}
        />
      </div>
      <div id={regionId} hidden={!open}>
        {open ? (
          <ErrorBoundary
            key={attempt}
            name="molecule-article-preview"
            fallback={() => (
              <div role="alert" className="theme-danger-panel space-y-2 rounded-card border p-4">
                <p className="theme-danger-text flex items-center gap-2 text-sm font-semibold">
                  <Icon icon="lucide:circle-alert" size={15} />
                  The article could not be drawn
                </p>
                <p className="theme-text-secondary text-sm">
                  The preview page failed to render. Your drawing and its unsaved edits are untouched; the brand preview beside the canvas is the image Save publishes.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
                  <Icon icon="lucide:rotate-cw" size={14} />
                  Try again
                </Button>
              </div>
            )}
          >
            <ArticlePreviewFrame
              label="Molecule preview"
              slug={slug}
              draft={svg ? { moleculeSvg: svg } : undefined}
              defaultWidth={narrow ? "phone" : "desktop"}
            />
          </ErrorBoundary>
        ) : null}
      </div>
    </section>
  );
}
