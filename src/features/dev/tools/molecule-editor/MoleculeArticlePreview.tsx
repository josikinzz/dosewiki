"use client";

import { useId, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { ArticlePreviewFrame } from "@/features/dev/components/ArticlePreviewFrame";

/**
 * The canvas's current depiction in the substance article's hero, in either
 * theme and at phone or desktop width, before Save. Closed by default: the
 * frame mounts the whole article, and the side column's small preview already
 * answers "does the drawing look right" while the chemist works.
 */
export function MoleculeArticlePreview({
  slug,
  svg,
}: {
  slug: string;
  /** The rendered canvas, the same bytes Save publishes. */
  svg: string | null;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <div className="space-y-3">
      <ExpandButton
        variant="chip"
        isExpanded={open}
        onToggle={() => setOpen((value) => !value)}
        label={open ? "Hide article preview" : "Preview in the article"}
        ariaLabel={open ? "Hide article preview" : "Preview in the article"}
        ariaControls={regionId}
      />
      <div id={regionId} hidden={!open}>
        {open ? (
          <ArticlePreviewFrame
            label="Molecule preview"
            slug={slug}
            draft={svg ? { moleculeSvg: svg } : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}
