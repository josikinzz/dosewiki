/**
 * Authentication hook for DoseWiki.
 *
 * Provides a unified interface for authentication state, wrapping WorkOS AuthKit
 * and Convex auth state. Falls back gracefully when auth is not configured.
 *
 * Usage:
 * ```tsx
 * const { isAuthenticated, isLoading, user, signIn, signOut } = useAuthUser();
 *
 * if (isLoading) return <LoadingSpinner />;
 * if (!isAuthenticated) return <button onClick={signIn}>Sign in</button>;
 * return <div>Welcome, {user?.name}</div>;
 * ```
 */

import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";
import { useMemo } from "react";
import { isAuthEnabled } from "@/lib/convex";

/**
 * Authenticated user information.
 */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
};

/**
 * Authentication state and actions.
 */
export type AuthState = {
  /** Whether the auth state is still loading */
  isLoading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Current user info (null if not authenticated) */
  user: AuthUser | null;
  /** Initiate sign-in flow */
  signIn: () => void;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Whether WorkOS auth is configured */
  authEnabled: boolean;
};

/**
 * Hook for authentication state and actions.
 *
 * When WorkOS auth is not configured (missing env vars), returns a disabled
 * state that allows unauthenticated access in development mode.
 */
export function useAuthUser(): AuthState {
  const authEnabled = isAuthEnabled();

  // Always call hooks unconditionally (React rules)
  // These will be no-ops when auth is disabled
  const workosAuth = useAuth();
  const convexAuth = useConvexAuth();

  // Debug logging
  console.log("[useAuthUser] authEnabled:", authEnabled);
  console.log("[useAuthUser] workosAuth.user:", workosAuth.user);
  console.log("[useAuthUser] convexAuth:", convexAuth);

  return useMemo(() => {
    // When auth is not enabled, return a development-friendly disabled state
    if (!authEnabled) {
      return {
        isLoading: false,
        isAuthenticated: true, // Allow access in dev mode
        user: {
          id: "dev-user",
          email: "dev@dosewiki.internal",
          name: "Development User",
        },
        signIn: () => {
          console.warn(
            "[Auth] Sign-in not available. Configure VITE_WORKOS_CLIENT_ID and VITE_WORKOS_REDIRECT_URI."
          );
        },
        signOut: async () => {
          console.warn(
            "[Auth] Sign-out not available. Configure VITE_WORKOS_CLIENT_ID and VITE_WORKOS_REDIRECT_URI."
          );
        },
        authEnabled: false,
      };
    }

    const { user: workosUser, signIn, signOut } = workosAuth;
    const { isLoading, isAuthenticated } = convexAuth;

    const user: AuthUser | null = workosUser
      ? {
          id: workosUser.id,
          email: workosUser.email ?? "",
          name: workosUser.firstName
            ? `${workosUser.firstName} ${workosUser.lastName ?? ""}`.trim()
            : workosUser.email ?? "User",
          avatarUrl: workosUser.profilePictureUrl ?? undefined,
        }
      : null;

    return {
      isLoading,
      isAuthenticated,
      user,
      signIn: () => signIn(),
      signOut: () => signOut(),
      authEnabled: true,
    };
  }, [authEnabled, workosAuth, convexAuth]);
}
