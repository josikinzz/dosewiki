/**
 * The one place a caught client render error is reported.
 *
 * Reporting is the browser console today: the reader analytics deliberately run
 * with `capture_exceptions: false` (see `ApprovedPublicAnalytics.tsx`), so no
 * exception leaves the reader's device. Route this function elsewhere if that
 * policy changes; every boundary and error page already calls it.
 *
 * One occurrence is reported once. A region boundary and the error page above it
 * can both see the same thrown object, and React StrictMode replays effects in
 * development, so thrown objects are remembered by identity.
 */

export type ClientErrorContext = {
  /** Stable name of the boundary or error page that caught the error. */
  boundary: string;
  /** React's component stack from `componentDidCatch`, when available. */
  componentStack?: string | null;
};

const reported = new WeakSet<object>();

/** Returns `true` when this call reported the error, `false` for a repeat. */
export function reportClientError(error: unknown, context: ClientErrorContext): boolean {
  if (typeof error === "object" && error !== null) {
    if (reported.has(error)) return false;
    reported.add(error);
  }

  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;
  const detail = {
    ...(digest ? { digest } : {}),
    ...(context.componentStack ? { componentStack: context.componentStack } : {}),
  };

  console.error(`[${context.boundary}] client render error`, error, detail);
  return true;
}
