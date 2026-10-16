import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AboutPaneSection({
  title,
  note,
  aside,
  className,
  children,
}: {
  title: string;
  note?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("min-w-0 space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-60 space-y-0.5">
          <h4 id={id} className="theme-text-primary text-sm font-semibold">{title}</h4>
          {note ? <p className="theme-text-muted max-w-[75ch] text-xs">{note}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ChangedMark({ changed }: { changed: boolean }) {
  if (!changed) return null;
  return (
    <span className="theme-text-secondary inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
      Changed
    </span>
  );
}
