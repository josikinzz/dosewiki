import type { CSSProperties, ReactNode } from "react";

import { SmartLink } from "@/components/common/SmartLink";
import { AppImage } from "@/components/common/AppImage";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface CaptionedImageProps {
  src?: string;
  width?: string;
  artist?: string;
  artistHref?: string;
  artistHrefExternal?: boolean;
  artistCredit?: ReactNode;
  title?: string;
  caption?: string;
  align?: "left" | "right" | "center";
  border?: boolean;
  top?: boolean;
}

const R2_CDN_BASE = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev";

function rewriteImageUrl(url: string): string {
  if (!url) return url;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("/img/gallery/")) {
    const filename = url.replace("/img/gallery/", "");
    return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
  }

  if (url.startsWith("/img/")) {
    const filename = url.replace("/img/", "");
    return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
  }

  return url;
}

export function CaptionedImage({
  src,
  width,
  artist,
  artistHref,
  artistHrefExternal = false,
  artistCredit,
  title,
  caption,
  align = "center",
  border = false,
}: CaptionedImageProps) {
  const imageSrc = rewriteImageUrl(src || "");

  if (!imageSrc) return null;

  const containerClass = {
    left: "clear-both mx-auto my-4 flex w-fit max-w-full flex-col sm:float-left sm:ml-0 sm:mr-8 sm:mt-1 sm:mb-6 sm:max-w-[var(--vcode-float-max)]",
    right: "clear-both mx-auto my-4 flex w-fit max-w-full flex-col sm:float-right sm:mr-0 sm:ml-8 sm:mt-1 sm:mb-6 sm:max-w-[var(--vcode-float-max)]",
    center: "mx-auto my-4 clear-both flex w-fit max-w-full flex-col items-center",
  }[align];

  const maxWidth = width
    ? `${width}px`
    : align === "center" ? "min(100%, 48rem)" : "min(350px, 40%)";

  const figureStyle: CSSProperties = align === "center"
    ? {
        maxWidth,
        marginLeft: "auto",
        marginRight: "auto",
      }
    :
      ({ "--vcode-float-max": maxWidth } as CSSProperties);

  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(imageSrc);
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
        {isVideo ? (
          <video
            src={imageSrc}
            className="w-full h-auto"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-label={title || caption || "Effect replication"}
          />
        ) : (
          <AppImage
            src={imageSrc}
            alt={title || caption || "Effect replication"}
            width={1200}
            height={900}
            className="w-full h-auto"
          />
        )}
        {hasCaptionContent && (
          <figcaption className="effect-vcode-caption px-3 py-2">
            {caption && (
              <div className="theme-text-muted text-xs leading-relaxed">
                {caption}
              </div>
            )}
            {artist && (
              <div className="theme-text-faint mt-0.5 text-[11px]">
                by{" "}
                {artistCredit ?? (artistHref ? (
                  artistHrefExternal ? (
                    <a
                      href={artistHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-current/40 underline-offset-2 transition-opacity hover:opacity-80"
                    >
                      {artist}
                    </a>
                  ) : (
                    <SmartLink
                      href={artistHref}
                      className="underline decoration-current/40 underline-offset-2 transition-opacity hover:opacity-80"
                    >
                      {artist}
                    </SmartLink>
                  )
                ) : (
                  artist
                ))}
              </div>
            )}
          </figcaption>
        )}
      </Surface>
    </figure>
  );
}
