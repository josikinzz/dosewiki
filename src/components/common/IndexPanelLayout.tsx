import type { CSSProperties, ReactNode } from "react";

export const INDEX_PANEL_MIN_COLUMN_WIDTH = 300;

const INDEX_PANEL_GAP_CLASS_NAME = "gap-5 lg:gap-6";
const INDEX_PANEL_SPACING_CLASS_NAME = "mx-auto w-full px-4";

/**
 * Page-level gutters. A panel layout nested inside a column that already has its
 * own padding — an article body, say — passes `padded={false}`, so its panels
 * keep the shared left edge of the prose instead of sitting inset from it.
 */
function spacingClassName(padded: boolean) {
  return padded ? INDEX_PANEL_SPACING_CLASS_NAME : "w-full";
}

interface IndexPanelMasonryProps {
  children: ReactNode;
  padded?: boolean;
}

export function IndexPanelMasonry({ children, padded = true }: IndexPanelMasonryProps) {
  return (
    <div className={`${spacingClassName(padded)} columns-[20rem] ${INDEX_PANEL_GAP_CLASS_NAME}`}>
      {children}
    </div>
  );
}

interface IndexPanelGridProps {
  children: ReactNode;
  columns: number;
  padded?: boolean;
}

export function IndexPanelGrid({ children, columns, padded = true }: IndexPanelGridProps) {
  const style = {
    "--index-panel-columns": Math.max(columns, 1),
  } as CSSProperties;

  return (
    <div
      className={`${spacingClassName(padded)} grid justify-center grid-cols-[repeat(var(--index-panel-columns),minmax(min(100%,18.75rem),24rem))] ${INDEX_PANEL_GAP_CLASS_NAME} max-[639px]:grid-cols-1`}
      style={style}
    >
      {children}
    </div>
  );
}

export const INDEX_PANEL_STACK_CLASS_NAME = "flex flex-col gap-5 lg:gap-6";
export const INDEX_PANEL_MASONRY_ITEM_CLASS_NAME = "mb-5 break-inside-avoid lg:mb-6";
