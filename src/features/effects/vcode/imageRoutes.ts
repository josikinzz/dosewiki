/**
 * Effect Index shipped some article images in per-drug-class variants, packed
 * into one `imageRoutes` attribute:
 *
 *   psychedelic:<url>:<title>:<artist>:<caption>,deliriant:<url>:...
 *
 * The migration kept the attribute but nothing read it, so a deliriant summary
 * page showed the psychedelic variant (or, before the `src` repoint, nothing).
 * This parses the packed form so the page renders the variant its own drug
 * class names.
 */
export interface ImageRouteVariant {
  src: string;
  title?: string;
  artist?: string;
  caption?: string;
}

// The URL carries its own colons, so the fields cannot be split blindly: the
// class key and the scheme-bearing URL are matched first, then exactly two
// colon-free fields, and the caption takes the rest.
const ROUTE_PATTERN =
  /^\s*([a-z][a-z0-9-]*):(https?:\/\/[^\s:]+(?::\d+)?[^\s]*?):([^:]*):([^:]*):(.*)$/i;

/** Every drug-class variant an `imageRoutes` attribute carries. */
function parseImageRoutes(
  value: string | undefined,
): Record<string, ImageRouteVariant> {
  if (!value) return {};
  const variants: Record<string, ImageRouteVariant> = {};
  for (const entry of value.split(",")) {
    const match = ROUTE_PATTERN.exec(entry);
    if (!match) continue;
    const [, key, src, title, artist, caption] = match;
    variants[key.toLowerCase()] = {
      src,
      title: title.trim() || undefined,
      artist: artist.trim() || undefined,
      caption: caption.trim() || undefined,
    };
  }
  return variants;
}

/**
 * The variant this surface should draw. A summary page names its own class
 * (`deliriant`, `psychedelic`); anything else, including a plain effect
 * article that belongs to no single class, gets no variant and keeps the
 * embed's own attributes.
 */
export function selectImageRoute(
  value: string | undefined,
  variantKey: string | undefined,
): ImageRouteVariant | null {
  if (!variantKey) return null;
  const variants = parseImageRoutes(value);
  return variants[variantKey.toLowerCase()] ?? null;
}
