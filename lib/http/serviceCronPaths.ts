/**
 * The editor-project crons Vercel invokes with `CRON_SECRET` instead of a
 * session cookie. Middleware lets exactly these GETs past the host and session
 * gates; each handler then authorizes itself through `cronRoute`. Edge-safe:
 * no imports, because middleware reads it.
 */
const SERVICE_CRON_PATHS: ReadonlySet<string> = new Set([
  "/api/cron/publication-delivery",
  "/api/cron/translation-bulk",
  "/api/cron/translation-refresh",
]);

export function isServiceCronRequest(method: string, pathname: string): boolean {
  return method === "GET" && SERVICE_CRON_PATHS.has(pathname);
}
