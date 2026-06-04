import { memo } from "react";
import { DiffSurface } from "./EditorSurfaces";

type DiffPreviewProps = {
  diffText: string;
  className?: string;
};

const DiffPreviewComponent = ({ diffText, className }: DiffPreviewProps) => {
  return <DiffSurface diffText={diffText} className={className} />;
};

export const DiffPreview = memo(DiffPreviewComponent);
