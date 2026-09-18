import { Children, type CSSProperties, type ReactNode, type Ref } from "react";
import {
  INDEX_PANEL_COLUMN_GATE_ATTRIBUTE,
  INDEX_PANEL_COLUMN_GATE_CSS,
  INDEX_PANEL_COLUMN_WIDTH,
  INDEX_PANEL_SMALL_GAP,
  INDEX_PANEL_LARGE_GAP,
  type IndexPanelColumnGate,
} from "./indexPanelColumns";

const INDEX_PANEL_GAP_CLASS_NAME =
  "[--index-panel-gap:var(--index-panel-small-gap)] lg:[--index-panel-gap:var(--index-panel-large-gap)] gap-[var(--index-panel-gap)]";
const INDEX_PANEL_STYLE = {
  "--index-panel-column-width": `${INDEX_PANEL_COLUMN_WIDTH}px`,
  "--index-panel-small-gap": `${INDEX_PANEL_SMALL_GAP}px`,
  "--index-panel-large-gap": `${INDEX_PANEL_LARGE_GAP}px`,
} as CSSProperties;
const INDEX_PANEL_SPACING_CLASS_NAME = "mx-auto w-full px-4";

/**
 * Page-level gutters. A panel layout nested inside a column that already has its
 * own padding, such as an article body, passes `padded={false}`, so its panels
 * use the existing gutters rather than adding a second inset.
 */
function spacingClassName(padded: boolean) {
  return padded ? INDEX_PANEL_SPACING_CLASS_NAME : "w-full";
}

interface IndexPanelMasonryProps {
  children: ReactNode;
  padded?: boolean;
}

export function IndexPanelMasonry({ children, padded = true }: IndexPanelMasonryProps) {
  const style = {
    ...INDEX_PANEL_STYLE,
    "--index-panel-items": Math.max(Children.count(children), 1),
    // Quantize the container, not just column-width: CSS columns otherwise
    // distribute spare width among their tracks and widen the article panels.
    width: "min(100%, max(var(--index-panel-column-width), calc(round(down, calc(100% + var(--index-panel-gap)), calc(var(--index-panel-column-width) + var(--index-panel-gap))) - var(--index-panel-gap))))",
    maxWidth: "calc(var(--index-panel-items) * (var(--index-panel-column-width) + var(--index-panel-gap)) - var(--index-panel-gap))",
  } as CSSProperties;

  return (
    <div className={spacingClassName(padded)}>
      <div
        className={`mx-auto columns-[var(--index-panel-column-width)] ${INDEX_PANEL_GAP_CLASS_NAME}`}
        style={style}
      >
        {children}
      </div>
    </div>
  );
}

interface IndexPanelGridProps {
  children: ReactNode;
  columns: number;
  /**
   * From `useResponsiveColumnCount`. While pending, hide the provisional
   * grouping until its container has been measured. Omit for a fixed count.
   */
  gate?: IndexPanelColumnGate | null;
  padded?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function IndexPanelGrid({ children, columns, gate = null, padded = true, ref }: IndexPanelGridProps) {
  const style = {
    ...INDEX_PANEL_STYLE,
    "--index-panel-columns": Math.max(columns, 1),
  } as CSSProperties;

  return (
    <>
      {gate !== null ? (
        <style href="index-panel-column-gate" precedence="default">
          {INDEX_PANEL_COLUMN_GATE_CSS}
        </style>
      ) : null}
      <div
        ref={ref}
        className={`${spacingClassName(padded)} grid justify-center grid-cols-[repeat(var(--index-panel-columns),minmax(0,var(--index-panel-column-width)))] ${INDEX_PANEL_GAP_CLASS_NAME} max-[639px]:grid-cols-[minmax(0,var(--index-panel-column-width))] transition-opacity duration-200 ease-out`}
        style={style}
        {...(gate !== null ? { [INDEX_PANEL_COLUMN_GATE_ATTRIBUTE]: gate } : null)}
      >
        {children}
      </div>
    </>
  );
}

export const INDEX_PANEL_STACK_CLASS_NAME = "flex flex-col gap-5 lg:gap-6";
export const INDEX_PANEL_MASONRY_ITEM_CLASS_NAME = "mb-5 break-inside-avoid lg:mb-6";
