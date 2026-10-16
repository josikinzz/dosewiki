"use client";

import { type ReactNode } from "react";
import { AnchorScrollRestore } from "@/components/common/AnchorScrollRestore";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface StickyTocLayoutProps {
  toc: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  contentClassName?: string;
  className?: string;
}

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
