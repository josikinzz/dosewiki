/**
 * Convex client configuration for DoseWiki.
 * 
 * This module provides the Convex client instance and React integration.
 * 
 * Environment variables:
 * - VITE_CONVEX_URL: The Convex deployment URL (required for production)
 * 
 * In development, run `bunx convex dev` to get your deployment URL.
 */

import { ConvexProvider as BaseConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

// Get the Convex URL from environment variables
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

// Create the Convex client (only if URL is available)
export const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Check if Convex is configured and available.
 */
export function isConvexEnabled(): boolean {
  return convex !== null;
}

/**
 * ConvexProvider wrapper that gracefully handles missing configuration.
 * If Convex is not configured, children render without Convex context.
 */
export function ConvexProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    // Convex not configured - render children without provider
    // This allows the app to fall back to local/compressed data loading
    return <>{children}</>;
  }

  return (
    <BaseConvexProvider client={convex}>
      {children}
    </BaseConvexProvider>
  );
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
