"use client";

import { memo, useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";
import { cn } from "@/lib/utils";

const MOBILE_QUERY = "(max-width: 639px)";
const MIN_TITLE_FONT_PX = 20;

function useFitTitleToWidth(enabled: boolean) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const runRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const title = titleRef.current;
    const run = runRef.current;
    if (!title || !run || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_QUERY);

    const fit = () => {
      title.style.fontSize = "";
      run.style.whiteSpace = "";
      if (!enabled || !media.matches) return;
      const available = title.clientWidth;
      const needed = run.scrollWidth;
      if (needed <= available || available === 0) return;
      const base = parseFloat(getComputedStyle(title).fontSize);
      const fitted = (base * available) / needed;
      title.style.setProperty(
        "font-size",
        `${Math.max(MIN_TITLE_FONT_PX, fitted)}px`,
        "important",
      );
      if (fitted < MIN_TITLE_FONT_PX) run.style.whiteSpace = "normal";
    };

    let cancelled = false;
    fit();
    document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });
    window.addEventListener("resize", fit);
    media.addEventListener("change", fit);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", fit);
      media.removeEventListener("change", fit);
    };
  }, [enabled]);

  return { titleRef, runRef };
}

interface PageHeaderProps {
  className?: string;
  title: string;
  description?: ReactNode;
  icon?: IconName;
  descriptionClassName?: string;
  titleClassName?: string;
  mobileTitleLayout?: "fit" | "wrap";
  align?: "center" | "left";
}

export const PageHeader = memo(function PageHeader({
  className,
  title,
  description,
  icon,
  descriptionClassName,
  titleClassName,
  mobileTitleLayout = "fit",
  align = "center",
}: PageHeaderProps) {
  const isLeft = align === "left";
  const { titleRef, runRef } = useFitTitleToWidth(mobileTitleLayout === "fit");
  const iconClassName =
    "theme-accent-heading mr-[0.2em] inline-block h-[0.72em] w-[0.72em] align-[0.02em] sm:absolute sm:right-full sm:top-1/2 sm:mr-[0.15em] sm:block sm:h-[1em] sm:w-[1em] sm:-translate-y-1/2";
  const titleClasses = cn(
    "type-page-title theme-accent-heading block w-full max-w-[22ch] text-balance wrap-normal!",
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
        <span ref={runRef} className={cn("relative inline-block", mobileTitleLayout === "fit" ? "max-sm:whitespace-nowrap" : "max-sm:max-w-full max-sm:whitespace-normal")}>
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
