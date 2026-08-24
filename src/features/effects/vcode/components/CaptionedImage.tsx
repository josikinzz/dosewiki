import type { CSSProperties } from "react";

import { AppImage } from "@/components/common/AppImage";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface CaptionedImageProps {
  src?: string;
  width?: string;
  artist?: string;
  title?: string;
  caption?: string;
  align?: "left" | "right" | "center";
  border?: boolean;
  top?: boolean;
}

// R2 CDN base URL for EffectIndex assets
const R2_CDN_BASE = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev";

/**
 * Rewrite old /img/gallery/ URLs to R2 CDN URLs.
 */
function rewriteImageUrl(url: string): string {
  if (!url) return url;

  // Already a full URL - return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Rewrite /img/gallery/ paths to R2 CDN
  if (url.startsWith("/img/gallery/")) {
    const filename = url.replace("/img/gallery/", "");
    return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
  }

  // Rewrite /img/ paths (without gallery)
  if (url.startsWith("/img/")) {
    const filename = url.replace("/img/", "");
    return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
  }

  return url;
}

/**
 * Image with caption and artist attribution.
 *
 * Adapts EffectIndex's captioned-image to DoseWiki's visual style.
 * Supports Wikipedia-style floating when align is "left" or "right".
 * Image, caption, and artist are contained within a unified card.
 */
export function CaptionedImage({
  src,
  width,
  artist,
  title,
  caption,
  align = "center",
  border = false,
}: CaptionedImageProps) {
  // Rewrite old URLs to R2 CDN
  const imageSrc = rewriteImageUrl(src || "");

  if (!imageSrc) return null;

  // Wikipedia-style floats from `sm` up. Below that the figure sits in normal
  // flow, centered — a float beside a phone-width column strands one word per
  // line next to the image.
  const containerClass = {
    left: "clear-both mx-auto my-4 flex w-fit max-w-full flex-col sm:float-left sm:ml-0 sm:mr-8 sm:mt-1 sm:mb-6 sm:max-w-[var(--vcode-float-max)]",
    right: "clear-both mx-auto my-4 flex w-fit max-w-full flex-col sm:float-right sm:mr-0 sm:ml-8 sm:mt-1 sm:mb-6 sm:max-w-[var(--vcode-float-max)]",
    center: "mx-auto my-4 clear-both flex w-fit max-w-full flex-col items-center",
  }[align];

  // Centered article images need a desktop cap; otherwise they expand to the
  // full prose width and visually read as left-aligned even when centered.
  const maxWidth = width
    ? `${width}px`
    : align === "center" ? "min(100%, 48rem)" : "min(350px, 40%)";

  const figureStyle: CSSProperties = align === "center"
    ? {
        maxWidth,
        marginLeft: "auto",
        marginRight: "auto",
      }
    : // The float cap only binds from `sm` up (via the class above); the base
      // `max-w-full` governs the collapsed mobile layout.
      ({ "--vcode-float-max": maxWidth } as CSSProperties);

  const hasCaptionContent = caption || artist;

  return (
    <figure
      className={containerClass}
      style={figureStyle}
    >
      <Surface
        variant="none"
        padding="none"
        radius="lg"
        className={cn(
          "theme-card-surface overflow-hidden",
          border && "ring-1 ring-[var(--theme-frosted-panel-border)]",
        )}
      >
        <AppImage
          src={imageSrc}
          alt={title || caption || "Effect replication"}
          width={1200}
          height={900}
          className="w-full h-auto"
        />
        {hasCaptionContent && (
          <figcaption className="effect-vcode-caption px-3 py-2">
            {caption && (
              <div className="theme-text-muted text-xs leading-relaxed">
                {caption}
              </div>
            )}
            {artist && (
              <div className="theme-text-faint mt-0.5 text-[11px]">
                by {artist}
              </div>
            )}
          </figcaption>
        )}
      </Surface>
    </figure>
  );
}
