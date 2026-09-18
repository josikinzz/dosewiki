"use client";

import { useEffect, useRef } from "react";

import { AppImage } from "@/components/common/AppImage";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

interface ReplicationStillStageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  controlsVisible: boolean;
  priority: boolean;
  onToggleControls: () => void;
  /** Positioning/rotation box for the image; upright full-bleed by default. */
  mediaClassName?: string;
  /** Reports the image's intrinsic size once decoded, for rotate-to-fit. */
  onProbeAspect?: (mediaWidth: number, mediaHeight: number) => void;
}

/** A still owns one tap meaning: reveal or dismiss the viewer transport. */
export function ReplicationStillStage({
  src,
  alt,
  width,
  height,
  controlsVisible,
  priority,
  onToggleControls,
  mediaClassName = "h-full w-full",
  onProbeAspect,
}: ReplicationStillStageProps) {
  const t = useT();
  const surfaceRef = useRef<HTMLButtonElement>(null);

  // Rows imported before dimensions were catalogued still need a real
  // orientation: read it off the decoded image itself. The listener targets
  // the rendered <img> because AppImage owns the element.
  useEffect(() => {
    if (!onProbeAspect) return;
    const image = surfaceRef.current?.querySelector("img");
    if (!image) return;
    const probe = () =>
      onProbeAspect(image.naturalWidth, image.naturalHeight);
    if (image.complete && image.naturalWidth > 0) {
      probe();
      return;
    }
    image.addEventListener("load", probe);
    return () => image.removeEventListener("load", probe);
  }, [onProbeAspect, src]);

  return (
    <button
      ref={surfaceRef}
      type="button"
      data-replication-media-surface
      aria-label={controlsVisible ? t("Hide controls") : t("Show controls")}
      onClick={onToggleControls}
      className={cn("absolute inset-0 h-full w-full", focusRingClassName)}
    >
      <AppImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        unoptimized
        sizes="100vw"
        className={cn(
          "object-contain transition-transform duration-200 motion-reduce:transition-none",
          mediaClassName,
        )}
      />
    </button>
  );
}
