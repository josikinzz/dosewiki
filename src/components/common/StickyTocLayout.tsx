"use client";

import { type ReactNode } from "react";
import { AnchorScrollRestore } from "@/components/common/AnchorScrollRestore";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface StickyTocLayoutProps {
  /**
   * Bare-variant table of contents shown in the sticky left gutter on wide
   * screens (>=1200px). Pass `null` to render the page without a gutter rail.
   */
  toc: ReactNode;
  /**
   * The article content. Include the page's inline (panel) table of contents
   * here wrapped in `min-[1200px]:hidden`, so it falls back to an in-flow TOC
   * below the wide breakpoint.
   */
  children: ReactNode;
  /** Width cap for the article column (and the single column below 1200px). */
  maxWidthClass?: string;
  /** Spacing utility for the content column, e.g. "gap-8" or "gap-10". */
  contentClassName?: string;
  /** Extra classes for the outer shell (e.g. responsive padding overrides). */
  className?: string;
}

/**
 * Shared page shell for long-form articles (substances, effects, trip reports).
 *
 * Below 1200px it is a single centered column — unchanged from a plain
 * `mx-auto max-w-4xl` page. At 1200px and up (the earliest a 896px article plus
 * a gutter rail physically fit) the table of contents and the article become a
 * centered *pair*: the article nudges slightly right of viewport-center while a
 * sticky TOC floats in the left gutter. The row keeps the default
 * `align-items: stretch`, so the aside spans the article's full height and its
 * sticky child can travel the whole page.
 */
export function StickyTocLayout({
  toc,
  children,
  maxWidthClass = "max-w-4xl",
  contentClassName,
  className,
}: StickyTocLayoutProps) {
  const t = useT();
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 pb-16 pt-8",
        maxWidthClass,
        "min-[1200px]:max-w-none min-[1200px]:flex-row min-[1200px]:justify-center min-[1200px]:gap-8",
        className,
      )}
    >
      <AnchorScrollRestore />

      {toc ? (
        <aside
          className="hidden w-[210px] shrink-0 min-[1200px]:block"
          aria-label={t("On this page")}
        >
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overflow-x-hidden">
            {toc}
          </div>
        </aside>
      ) : null}

      <div className={cn("flex w-full flex-col", maxWidthClass, contentClassName)}>
        {children}
      </div>
    </div>
  );
}
