import type { CSSProperties, ReactNode } from "react";

export const INDEX_PANEL_MIN_COLUMN_WIDTH = 300;

const INDEX_PANEL_GAP_CLASS_NAME = "gap-5 lg:gap-6";
const INDEX_PANEL_SPACING_CLASS_NAME = "mx-auto w-full px-4";

interface IndexPanelMasonryProps {
  children: ReactNode;
}

export function IndexPanelMasonry({ children }: IndexPanelMasonryProps) {
  return (
    <div className={`${INDEX_PANEL_SPACING_CLASS_NAME} columns-[20rem] ${INDEX_PANEL_GAP_CLASS_NAME}`}>
      {children}
    </div>
  );
}

interface IndexPanelGridProps {
  children: ReactNode;
  columns: number;
}

export function IndexPanelGrid({ children, columns }: IndexPanelGridProps) {
  const style = {
    "--index-panel-columns": Math.max(columns, 1),
  } as CSSProperties;

  return (
    <div
      className={`${INDEX_PANEL_SPACING_CLASS_NAME} grid grid-cols-[repeat(var(--index-panel-columns),minmax(min(100%,18.75rem),1fr))] ${INDEX_PANEL_GAP_CLASS_NAME} max-[639px]:grid-cols-1`}
      style={style}
    >
      {children}
    </div>
  );
}

export const INDEX_PANEL_STACK_CLASS_NAME = "flex flex-col gap-5 lg:gap-6";
export const INDEX_PANEL_MASONRY_ITEM_CLASS_NAME = "mb-5 break-inside-avoid lg:mb-6";
