"use client";

import { useId, useState, type ReactNode } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";

/**
 * A collapsible section of the workbench. Its content mounts the first time it
 * opens and stays mounted after it closes, so a loaded report or a half-typed
 * correction survives folding it away.
 */
export function WorkbenchDrawer({ title, detail, defaultOpen = false, children }: {
  title: string;
  /** A short status read beside the title. */
  detail?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [visited, setVisited] = useState(defaultOpen);
  return (
    <div className="border-t border-[var(--theme-border-subtle)] pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        className="theme-focus-ring theme-text-primary flex w-full cursor-pointer items-center gap-2 rounded-md py-2 text-left font-semibold"
        onClick={() => { setOpen(!open); setVisited(true); }}
      >
        {title}
        {detail ? <span className="theme-text-faint text-xs font-normal">{detail}</span> : null}
        <ExpandIndicator isExpanded={open} />
      </button>
      <div id={bodyId} hidden={!open} className="pb-4">{visited ? children : null}</div>
    </div>
  );
}
