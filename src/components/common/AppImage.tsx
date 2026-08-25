import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ImgHTMLAttributes } from "react";
import { publicConvexUrl } from "../../../lib/runtime/publicEnv";

type AppImageProps = {
  src: string | StaticImageData;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Skip the next/image optimizer. Required for SVG srcs that don't end in `.svg` (e.g. `/api/molecules/<slug>?v=…`) — the optimizer rejects SVG content. */
  unoptimized?: boolean;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  draggable?: boolean;
  style?: CSSProperties;
  title?: string;
};

function isLocalImage(src: string | StaticImageData) {
  return typeof src !== "string" || src.startsWith("/");
}

const convexStorageOrigin = (() => {
  if (!publicConvexUrl) return null;
  try {
    return new URL(publicConvexUrl).origin;
  } catch {
    return null;
  }
})();

/**
 * Convex file-storage URLs on this build's own deployment (replication artwork,
 * posters, thumbnails). These are the one class of remote URL the optimizer is
 * configured to accept: next.config.ts derives its `images.remotePatterns`
 * entry from the same browser Convex URL, so routing exactly these through
 * next/image can never 400. Every other remote host (editor-entered covers,
 * artist favicons, …) stays on the plain <img> branch below.
 */
function isConvexStorageImage(src: string | StaticImageData) {
  return (
    typeof src === "string" &&
    convexStorageOrigin !== null &&
    src.startsWith(`${convexStorageOrigin}/api/storage/`)
  );
}

export function AppImage({
  src,
  alt,
  width,
  height,
  className,
  sizes,
  priority = false,
  unoptimized = false,
  loading,
  draggable,
  style,
  title,
}: AppImageProps) {
  if (isLocalImage(src) || isConvexStorageImage(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={priority ? undefined : loading}
        priority={priority}
        unoptimized={unoptimized}
        className={className}
        draggable={draggable}
        style={style}
        title={title}
      />
    );
  }

  const imgSrc = typeof src === "string" ? src : src.src;

  return (
    <img
      src={imgSrc}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      loading={priority ? "eager" : loading ?? "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      draggable={draggable}
      style={style}
      title={title}
    />
  );
}
