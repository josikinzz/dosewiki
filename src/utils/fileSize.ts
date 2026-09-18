/**
 * Human-readable file size in decimal units (1 KB = 1,000 bytes), the
 * convention of Finder and browser download shelves, so a label matches what
 * the reader sees once the file lands. One decimal from a megabyte up, whole
 * kilobytes below, rounding before the unit is chosen so 999,950 bytes reads
 * "1.0 MB" rather than "1000 KB".
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  const kilobytes = Math.round(bytes / 1_000);
  if (kilobytes < 1_000) return `${kilobytes} KB`;
  const megabytes = bytes / 1_000_000;
  if (megabytes < 999.95) return `${megabytes.toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
