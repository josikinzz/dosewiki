import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Hairline-separated term/definition rows for flat reference surfaces — the
 * pattern that replaced the old homogeneous two-up card grids (style-guide §9
 * index-list rhythm). Each row is a responsive two-column grid: a fixed-width
 * label/title column on the left at wider widths, body prose flowing beside it.
 *
 * Two pieces:
 *   - `DefinitionRow` — one row. Renders the grid wrapper and drops `term`
 *     (left column) and `children` (right column body) straight in, so the DOM
 *     is whatever the caller composes. Pass `semantic` to render `term` as a
 *     <dt> and `children` as a <dd> (use inside a <dl>); otherwise both columns
 *     are plain wrappers and the caller styles the body element itself.
 *   - `DefinitionList` — optional wrapper that renders a semantic <dl> holding
 *     the rows. Hairline dividers/spacing between rows come from the enclosing
 *     surface (e.g. a `divide-y` ContentCard), so the list element only carries
 *     whatever className you pass.
 *
 * Both accept `className`, merged last via `cn`, and use --theme-* utilities
 * only.
 */
const definitionRowClassName = "grid gap-x-6 gap-y-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[14rem_1fr]"

export type DefinitionRowProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> & {
  /** Left column: a label and/or title node. */
  term: React.ReactNode;
  /** Right column: the definition body. */
  children: React.ReactNode;
  /**
   * Render `term` as a <dt> and `children` as a <dd> so the row reads as a real
   * description-list entry. Use inside a <dl> (e.g. `DefinitionList`). When
   * omitted, the row places `term` and `children` directly, letting the caller
   * own both column elements.
   */
  semantic?: boolean;
  /** className for the inner <dt> when `semantic` is set. */
  termClassName?: string;
  /** className for the inner <dd> when `semantic` is set. */
  bodyClassName?: string;
};

export const DefinitionRow = React.forwardRef<HTMLDivElement, DefinitionRowProps>(
  function DefinitionRow(
    { term, children, semantic, termClassName, bodyClassName, className, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn(definitionRowClassName, className)} {...props}>
        {semantic ? (
          <>
            <dt className={termClassName}>{term}</dt>
            <dd className={bodyClassName}>{children}</dd>
          </>
        ) : (
          <>
            {term}
            {children}
          </>
        )}
      </div>
    );
  },
);

export type DefinitionListProps = React.HTMLAttributes<HTMLDListElement>;

export const DefinitionList = React.forwardRef<HTMLDListElement, DefinitionListProps>(
  function DefinitionList({ children, className, ...props }, ref) {
    return (
      <dl ref={ref} className={className} {...props}>
        {children}
      </dl>
    );
  },
);
