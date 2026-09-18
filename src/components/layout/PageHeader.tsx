"use client";

import { memo, useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";
import { cn } from "@/lib/utils";

const MOBILE_QUERY = "(max-width: 639px)";
const MIN_TITLE_FONT_PX = 20;

/**
 * On phones the title is one line sized to the column: no balancing, no
 * non-breaking-space tricks, no guessing where a long name wraps. The h1 is
 * rendered at its stylesheet size, the text run measured, and the font shrunk
 * by exactly the overflow ratio. Wider viewports keep the stylesheet size.
 */
function useFitTitleToWidth() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const runRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const title = titleRef.current;
    const run = runRef.current;
    if (!title || !run || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_QUERY);

    const fit = () => {
      title.style.fontSize = "";
      if (!media.matches) return;
      const available = title.clientWidth;
      const needed = run.scrollWidth;
      if (needed <= available || available === 0) return;
      const base = parseFloat(getComputedStyle(title).fontSize);
      title.style.setProperty(
        "font-size",
        `${Math.max(MIN_TITLE_FONT_PX, (base * available) / needed)}px`,
        "important",
      );
    };

    fit();
    window.addEventListener("resize", fit);
    media.addEventListener("change", fit);
    return () => {
      window.removeEventListener("resize", fit);
      media.removeEventListener("change", fit);
    };
  }, []);

  return { titleRef, runRef };
}

interface PageHeaderProps {
  className?: string;
  title: string;
  description?: ReactNode;
  icon?: IconName;
  descriptionClassName?: string;
  /** Extra classes merged onto the `h1`, e.g. a page that wants a smaller title. */
  titleClassName?: string;
  /**
   * Horizontal alignment of the whole header.
   *
   * Centred is right for a landing page whose header is the only thing above
   * the fold. It is wrong as soon as the page reads as an article: a centred
   * title above left-aligned prose has no shared edge with anything below it,
   * and next to a table-of-contents rail it drifts into the middle of the page
   * with nothing to anchor it. Those pages pass "left".
   */
  align?: "center" | "left";
}

export const PageHeader = memo(function PageHeader({
  className,
  title,
  description,
  icon,
  descriptionClassName,
  titleClassName,
  align = "center",
}: PageHeaderProps) {
  const isLeft = align === "left";
  const { titleRef, runRef } = useFitTitleToWidth();
  // On phones the icon is inline, capital-letter sized, leading the text. From
  // `sm` up it hangs out of flow off the left edge of the text run, so the
  // title centres on its letters alone and the glyph does not shift the
  // optical middle; the h1 carries side padding one glyph wide to leave room
  // for it. Either way it is solid accent colour.
  const iconClassName =
    "theme-accent-heading mr-[0.2em] inline-block h-[0.72em] w-[0.72em] align-[0.02em] sm:absolute sm:right-full sm:top-1/2 sm:mr-[0.15em] sm:block sm:h-[1em] sm:w-[1em] sm:-translate-y-1/2";
  const titleClasses = cn(
    "type-page-title theme-accent-heading block w-full max-w-[22ch] text-balance wrap-normal! max-sm:text-4xl sm:text-5xl md:text-6xl",
    icon ? (isLeft ? "sm:pl-[1.15em]" : "sm:px-[1.15em]") : undefined,
    isLeft ? undefined : "mx-auto",
    titleClassName,
  );

  return (
    <header
      className={cn(
        "relative isolate mb-16 flex flex-col gap-5",
        isLeft ? "items-start text-left" : "text-center",
        className,
      )}
    >
      <h1 ref={titleRef} className={titleClasses}>
        {/* Phone nowrap lives on the run, not the h1: `.type-page-title`'s
            `text-wrap: balance` reopens the `white-space` shorthand there. */}
        <span ref={runRef} className="relative inline-block max-sm:whitespace-nowrap">
          {icon ? <IconComponent icon={icon} size="1em" className={iconClassName} /> : null}
          {title}
        </span>
      </h1>
      {description ? (
        <div
          className={
            descriptionClassName ??
            cn(
              "type-lead type-reading-measure theme-accent-emphasis-scope theme-text-secondary text-balance",
              isLeft ? undefined : "mx-auto",
            )
          }
        >
          {description}
        </div>
      ) : null}
    </header>
  );
});
