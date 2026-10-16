import { memo } from "react";
import { DiffSurface } from "./EditorSurfaces";

type DiffPreviewProps = {
  diffText: string;
  className?: string;
  maxHeight?: number | string;
  highlight?: string;
};

const DiffPreviewComponent = ({ diffText, className, maxHeight, highlight }: DiffPreviewProps) => {
  return <DiffSurface diffText={diffText} className={className} maxHeight={maxHeight} highlight={highlight} />;
};

export const DiffPreview = memo(DiffPreviewComponent);
