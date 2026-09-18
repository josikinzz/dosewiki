import { memo } from "react";
import { DiffSurface } from "./EditorSurfaces";

type DiffPreviewProps = {
  diffText: string;
  className?: string;
  /**
   * Height cap for the scrollable diff body. Use this instead of a `max-h-*`
   * className — the className lands on the overflow-hidden wrapper and clips
   * content without a scrollbar.
   */
  maxHeight?: number | string;
};

const DiffPreviewComponent = ({ diffText, className, maxHeight }: DiffPreviewProps) => {
  return <DiffSurface diffText={diffText} className={className} maxHeight={maxHeight} />;
};

export const DiffPreview = memo(DiffPreviewComponent);
