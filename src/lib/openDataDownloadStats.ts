/** Exact saved-file measurements, never estimated from a page's record counts. */
export type PublicDownloadStats = {
  count: number;
  bytes: number;
};

export type OpenDataDownloadStats = PublicDownloadStats & {
  /** SHA-256 of the decoded JSON document, including its generation timestamp. */
  revision: string;
};

/** Read metadata attached to the download itself, not a separately rebuilt export. */
export function getOpenDataDownloadStats(headers: Headers): OpenDataDownloadStats | null {
  const countHeader = headers.get("X-Open-Data-Count");
  const bytesHeader = headers.get("X-Open-Data-Bytes");
  const revision = headers.get("X-Open-Data-Revision");
  if (!countHeader || !bytesHeader || !revision || !/^[a-f0-9]{64}$/.test(revision)) return null;
  const count = Number(countHeader);
  const bytes = Number(bytesHeader);
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(bytes) || bytes < 0) return null;
  return { count, bytes, revision };
}
