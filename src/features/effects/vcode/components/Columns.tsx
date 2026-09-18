import { PropsWithChildren } from "react";

import {
  INDEX_PANEL_MASONRY_ITEM_CLASS_NAME,
  IndexPanelMasonry,
} from "@/components/common/IndexPanelLayout";

/**
 * Multi-column layout container.
 *
 * Effect Index always emits three `[column]`s and leaves the unused ones empty,
 * so a fixed track count would strand blank cells and squeeze the filled ones
 * below the width an index panel needs. The shared masonry flows whatever
 * survives the renderer's blank-column filter into as many columns as the
 * measure actually fits, at each panel's own height, using the same preferred
 * panel width as the Substance and Effect indexes.
 */
export function Columns({ children }: PropsWithChildren) {
  return (
    // The masonry items carry their own bottom gap, so the wrapper only makes
    // up the difference underneath.
    <div className="mt-7 mb-2">
      <IndexPanelMasonry padded={false}>{children}</IndexPanelMasonry>
    </div>
  );
}

/**
 * Individual column within Columns container.
 *
 * A layout cell only: its panel brings its own card, and a card inside a card
 * reads as a framing mistake.
 */
export function Column({ children }: PropsWithChildren) {
  return <div className={INDEX_PANEL_MASONRY_ITEM_CLASS_NAME}>{children}</div>;
}
