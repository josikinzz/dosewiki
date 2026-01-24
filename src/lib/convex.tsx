/**
 * Convex client configuration for DoseWiki with WorkOS AuthKit integration.
 *
 * This module provides:
 * - Convex client instance and React integration
 * - WorkOS AuthKit provider for JWT-based authentication
 * - Graceful fallback when auth is not configured
 *
 * Environment variables:
 * - VITE_CONVEX_URL: The Convex deployment URL (required)
 * - VITE_WORKOS_CLIENT_ID: WorkOS client ID (optional, enables auth)
 * - VITE_WORKOS_REDIRECT_URI: OAuth callback URL (optional, enables auth)
 *
 * SECURITY: This implements VULN-01 and VULN-04 remediation from the security
 * audit by using secure JWT-based sessions instead of localStorage passwords.
 */

import { ConvexProvider as BaseConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuth } from "convex/react";
import { AuthKitProvider, useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import { ReactNode, useCallback, useMemo } from "react";

// Get environment variables
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;
const workosRedirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI as string | undefined;

// Create the Convex client (only if URL is available)
export const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Check if Convex is configured and available.
 */
export function isConvexEnabled(): boolean {
  return convex !== null;
}

/**
 * Check if WorkOS authentication is configured.
 */
export function isAuthEnabled(): boolean {
  return Boolean(workosClientId && workosRedirectUri);
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

/**
 * Hook that bridges WorkOS auth to Convex's expected auth interface.
 * Used by ConvexProviderWithAuth to provide authentication tokens.
 */
function useAuthFromWorkOS() {
  const { isLoading, user, getAccessToken } = useWorkOSAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        const token = await getAccessToken();
        return token ?? null;
      } catch (error) {
        console.error("[Auth] Failed to get access token:", error);
        return null;
      }
    },
    [getAccessToken]
  );

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: Boolean(user),
      fetchAccessToken,
    }),
    [isLoading, user, fetchAccessToken]
  );
}

/**
 * Inner provider that wraps Convex with WorkOS auth.
 * Only rendered when auth is enabled.
 */
function ConvexWithWorkOS({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex!} useAuth={useAuthFromWorkOS}>
      {children}
    </ConvexProviderWithAuth>
  );
}

/**
 * ConvexProvider wrapper with optional WorkOS authentication.
 *
 * - If Convex is not configured, renders children without provider
 * - If auth is enabled, wraps with AuthKitProvider and ConvexProviderWithAuth
 * - If auth is disabled, uses basic ConvexProvider with a dummy AuthKitProvider
 *   (so useAuth hook doesn't throw)
 */
export function ConvexProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    // Convex not configured - render children without provider
    return <>{children}</>;
  }

  if (isAuthEnabled()) {
    // Auth is enabled - wrap with AuthKit and Convex auth
    return (
      <AuthKitProvider
        clientId={workosClientId!}
        redirectUri={workosRedirectUri!}
      >
        <ConvexWithWorkOS>{children}</ConvexWithWorkOS>
      </AuthKitProvider>
    );
  }

  // Auth not configured - use basic Convex provider with dummy AuthKitProvider
  // The dummy provider prevents useAuth() from throwing
  return (
    <AuthKitProvider
      clientId="disabled"
      redirectUri="http://localhost:5173/callback"
    >
      <BaseConvexProvider client={convex}>
        {children}
      </BaseConvexProvider>
    </AuthKitProvider>
  );
}
