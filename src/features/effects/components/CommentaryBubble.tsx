"use client";

import { useId, useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { cn } from "@/lib/utils";

/**
 * Collapsible speech-bubble panel for Personal Commentary.
 *
 * Shows roughly the first paragraph with a masked fade, expanding via the
 * standard ellipsis-chevron control used by other collapsible surfaces.
 */
export function CommentaryBubble({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <div className="theme-aside-panel rounded-2xl px-5 pb-3 pt-5 sm:px-6">
      <div
        id={contentId}
        className={cn(
          "overflow-hidden",
          !expanded &&
            "max-h-48 [mask-image:linear-gradient(to_bottom,black_calc(100%-4rem),transparent)]",
        )}
      >
        {children}
      </div>
      <div className="mt-2 flex justify-center">
        <ExpandButton
          isExpanded={expanded}
          onToggle={() => setExpanded((prev) => !prev)}
          ariaLabel={expanded ? "Collapse commentary" : "Expand commentary"}
          ariaControls={contentId}
        />
      </div>
    </div>
  );
}
