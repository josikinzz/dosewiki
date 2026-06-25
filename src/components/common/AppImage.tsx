import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ImgHTMLAttributes } from "react";

type AppImageProps = {
  src: string | StaticImageData;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  draggable?: boolean;
  style?: CSSProperties;
  title?: string;
};

function isLocalImage(src: string | StaticImageData) {
  return typeof src !== "string" || src.startsWith("/");
}

export function AppImage({
  src,
  alt,
  width,
  height,
  className,
  sizes,
  priority = false,
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
        priority={priority}
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
