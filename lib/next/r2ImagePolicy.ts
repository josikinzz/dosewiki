import { isValidR2Key } from "../../server/lib/replicationUrls";

// Managed originals and responsive renditions share the Worker's withdrawal gate.
export const MANAGED_MEDIA_HOST = "dosewiki-media.gremblinzuwu.workers.dev";
const STILL_PATH = /\.(?:jpg|jpeg|png|webp|avif)$/;
export const RESPONSIVE_WIDTHS = [64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const;

function imageUrl(src: string): URL | null {
  try {
    return new URL(src);
  } catch {
    return null;
  }
}

export function isManagedResponsiveImage(src: string): boolean {
  const url = imageUrl(src);
  return url !== null
    && src === `https://${MANAGED_MEDIA_HOST}${url.pathname}`
    && STILL_PATH.test(url.pathname)
    && isValidR2Key(url.pathname.slice(1));
}

/** Emit only public Worker URLs, never optimizer URLs or private rendition keys. */
export function getManagedImageCandidates(src: string, width: number, sizes?: string) {
  if (!isManagedResponsiveImage(src)) return null;

  const widths = sizes
    ? RESPONSIVE_WIDTHS
    : [...new Set([width, width * 2].map((target) =>
      RESPONSIVE_WIDTHS.find((candidate) => candidate >= target) ?? RESPONSIVE_WIDTHS[RESPONSIVE_WIDTHS.length - 1],
    ))];
  return {
    src: `${src}?width=${widths[widths.length - 1]}`,
    srcSet: widths.map((candidate, index) =>
      `${src}?width=${candidate} ${sizes ? `${candidate}w` : `${index + 1}x`}`,
    ).join(", "),
  };
}
