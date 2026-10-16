export type ClientErrorContext = {
  boundary: string;
  componentStack?: string | null;
};

const reported = new WeakSet<object>();

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
