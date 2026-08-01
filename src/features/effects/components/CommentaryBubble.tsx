"use client";

import { useId, useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { cn } from "@/lib/utils";

/**
 * Collapsible speech-bubble panel for Personal Commentary, with a tail
 * pointing down-right toward the attribution chip rendered below it.
 *
 * Shows roughly the first paragraph with a masked fade, expanding via the
 * standard ellipsis-chevron control used by other collapsible surfaces.
 */
export function CommentaryBubble({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <div className="theme-aside-panel relative rounded-2xl px-5 pb-3 pt-5 sm:px-6">
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
      {/* Tail: a rotated square sharing the panel fill and border. Its opaque
          top half covers the bubble's bottom border, notching the outline so
          bubble and tail read as one continuous speech-bubble shape. */}
      <div
        aria-hidden
        className="theme-aside-panel-tail absolute -bottom-[7px] right-24 h-3.5 w-3.5 rotate-45 rounded-br-[2px]"
      />
    </div>
  );
}
