const SERVICE_CRON_PATHS: ReadonlySet<string> = new Set([
  "/api/cron/publication-delivery",
  "/api/cron/translation-bulk",
  "/api/cron/translation-refresh",
]);

export function isServiceCronRequest(method: string, pathname: string): boolean {
  return method === "GET" && SERVICE_CRON_PATHS.has(pathname);
}
