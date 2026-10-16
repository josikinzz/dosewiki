export interface ImageRouteVariant {
  src: string;
  title?: string;
  artist?: string;
  caption?: string;
}

const ROUTE_PATTERN =
  /^\s*([a-z][a-z0-9-]*):(https?:\/\/[^\s:]+(?::\d+)?[^\s]*?):([^:]*):([^:]*):(.*)$/i;

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

export function selectImageRoute(
  value: string | undefined,
  variantKey: string | undefined,
): ImageRouteVariant | null {
  if (!variantKey) return null;
  const variants = parseImageRoutes(value);
  return variants[variantKey.toLowerCase()] ?? null;
}
