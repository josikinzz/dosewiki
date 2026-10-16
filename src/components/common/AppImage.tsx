import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ImgHTMLAttributes } from "react";
import { getManagedImageCandidates } from "../../../lib/next/r2ImagePolicy";

type AppImageProps = {
  src: string | StaticImageData;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  unoptimized?: boolean;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  draggable?: boolean;
  style?: CSSProperties;
  title?: string;
};

function isLocalImage(src: string | StaticImageData) {
  return typeof src !== "string" || (src.startsWith("/") && !src.startsWith("//"));
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
  if (isLocalImage(src)) {
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
  const candidates = unoptimized ? null : getManagedImageCandidates(imgSrc, width, sizes);

  return (
    <img
      srcSet={candidates?.srcSet}
      src={candidates?.src ?? imgSrc}
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
