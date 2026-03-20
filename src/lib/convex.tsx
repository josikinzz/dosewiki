import { ConvexProvider as BaseConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { publicConvexUrl } from "../../lib/runtime/publicEnv";

const convexUrl = publicConvexUrl;

export const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Check if Convex is configured and available.
 */
export function isConvexEnabled(): boolean {
  return convex !== null;
}

/**
 * Get the Convex URL when configured.
 */
export function getConvexUrl(): string | null {
  return convexUrl ?? null;
}

/**
 * Get the Convex client instance.
 * Throws if Convex is not configured.
 */
export function getConvexClient(): ConvexReactClient {
  if (!convex) {
    throw new Error(
      "Convex is not configured. Set VITE_CONVEX_URL environment variable."
    );
  }
  return convex;
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return <>{children}</>;
  }

  return (
    <BaseConvexProvider client={convex}>
      {children}
    </BaseConvexProvider>
  );
}
