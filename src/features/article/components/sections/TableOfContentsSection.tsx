"use client";

import { memo } from "react";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";

export interface TableOfContentsSectionProps {
  items: PublicTableOfContentsItem[];
  /** "strip" renders the sticky mobile chip strip instead of the panel/rail. */
  variant?: "panel" | "bare" | "strip";
  className?: string;
}

/** The hydrated TOC island receives labels and presence already projected. */
export const TableOfContentsSection = memo(function TableOfContentsSection({
  items,
  variant,
  className,
}: TableOfContentsSectionProps) {
  if (items.length === 0) return null;

  if (variant === "strip") {
    return <PublicTocStrip items={items} className={className} />;
  }

  return (
    <PublicTableOfContents
      items={items}
      variant={variant}
      className={className}
    />
  );
});
