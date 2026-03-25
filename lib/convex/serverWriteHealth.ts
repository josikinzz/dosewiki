import "server-only";

export type ServerConvexWriteHealth = {
  adminKeyConfigured: boolean;
  convexUrlConfigured: boolean;
  canSaveToConvex: boolean;
  issues: string[];
};

function hasNonEmptyValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getServerConvexAdminKey(): string | null {
  return hasNonEmptyValue(process.env.CONVEX_ADMIN_KEY) ? process.env.CONVEX_ADMIN_KEY : null;
}

export function getServerConvexUrl(): string | null {
  const url =
    process.env.CONVEX_URL ??
    process.env.VITE_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL;

  return hasNonEmptyValue(url) ? url : null;
}

export function getServerConvexWriteHealth(): ServerConvexWriteHealth {
  const adminKeyConfigured = getServerConvexAdminKey() !== null;
  const convexUrlConfigured = getServerConvexUrl() !== null;
  const issues: string[] = [];

  if (!adminKeyConfigured) {
    issues.push("Missing CONVEX_ADMIN_KEY on the server.");
  }

  if (!convexUrlConfigured) {
    issues.push("Missing Convex URL on the server.");
  }

  return {
    adminKeyConfigured,
    convexUrlConfigured,
    canSaveToConvex: adminKeyConfigured && convexUrlConfigured,
    issues,
  };
}
