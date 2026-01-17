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

  const alignClass = {
    left: "mr-auto",
    right: "ml-auto",
    center: "mx-auto",
  }[align];

  const maxWidth = width ? `${width}px` : "100%";

  return (
    <figure 
      className={`my-4 ${alignClass}`}
      style={{ maxWidth }}
    >
      <div 
        className={`
          rounded-xl overflow-hidden
          ${border ? "border border-fuchsia-400/30 p-1 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10" : ""}
        `}
      >
        <img
          src={imageSrc}
          alt={title || caption || "Effect replication"}
          className="w-full h-auto rounded-lg"
          loading="lazy"
        />
      </div>
      {(caption || artist) && (
        <figcaption className="mt-2 text-center">
          {caption && (
            <p className="text-xs text-white/60 leading-relaxed">
              {caption}
            </p>
          )}
          {artist && (
            <p className="text-[11px] text-white/40 mt-1">
              Artist: {artist}
            </p>
          )}
        </figcaption>
      )}
    </figure>
  );
}
