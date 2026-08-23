"use client";

import { AppImage } from "@/components/common/AppImage";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface ReplicationStillStageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  controlsVisible: boolean;
  onToggleControls: () => void;
}

/** A still owns one tap meaning: reveal or dismiss the viewer transport. */
export function ReplicationStillStage({
  src,
  alt,
  width,
  height,
  controlsVisible,
  onToggleControls,
}: ReplicationStillStageProps) {
  return (
    <button
      type="button"
      aria-label={controlsVisible ? "Hide controls" : "Show controls"}
      onClick={onToggleControls}
      className={cn("absolute inset-0 h-full w-full", focusRingClassName)}
    >
      <AppImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority
        sizes="100vw"
        className="h-full w-full object-contain"
      />
    </button>
  );
}
