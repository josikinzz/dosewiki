export function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  const kilobytes = Math.round(bytes / 1_000);
  if (kilobytes < 1_000) return `${kilobytes} KB`;
  const megabytes = bytes / 1_000_000;
  if (megabytes < 999.95) return `${megabytes.toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
