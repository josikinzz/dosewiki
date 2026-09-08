const REPLICATION_EMBED_PATH = "/embed/replications";
const PRODUCTION_PARENT_ORIGINS = [
  "https://osmanthus.io",
  "https://www.osmanthus.io",
  // Approved Osmanthus development clients of the production publisher.
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;
const PRODUCTION_FRAME_ANCESTORS = `'self' ${PRODUCTION_PARENT_ORIGINS.join(" ")}`;

export function isReplicationEmbedPath(pathname: string): boolean {
  return pathname === REPLICATION_EMBED_PATH;
}

function parseExactOrigin(origin: string): URL | null {
  try {
    const url = new URL(origin);
    // Reject URL normalization, credentials, paths (even /), query, and fragments.
    // postMessage event.origin is already serialized in this canonical form.
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === origin
      ? url
      : null;
  } catch {
    return null;
  }
}

export function isAllowedReplicationEmbedParent(
  origin: string,
  {
    isDevelopment = false,
    publisherOrigin = "https://dose.wiki",
  }: { isDevelopment?: boolean; publisherOrigin?: string } = {},
): boolean {
  const url = parseExactOrigin(origin);
  if (!url) return false;
  if (PRODUCTION_PARENT_ORIGINS.some((allowed) => origin === allowed)) return true;

  if (url.protocol === "http:") {
    return isDevelopment && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  }

  return parseExactOrigin(publisherOrigin) !== null && origin === publisherOrigin;
}

export function getReplicationEmbedFrameAncestors(
  { isDevelopment = false }: { isDevelopment?: boolean } = {},
): string {
  return isDevelopment
    ? `${PRODUCTION_FRAME_ANCESTORS} http://localhost:* http://127.0.0.1:*`
    : PRODUCTION_FRAME_ANCESTORS;
}
