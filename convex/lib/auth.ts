/**
 * Authentication utilities for Convex mutations.
 *
 * This module provides dual authentication:
 * 1. Convex identity authentication for browser clients when available
 * 2. API key authentication for batch scripts and automated processes
 *
 * SECURITY: This implements VULN-01 (unauthenticated mutations) and VULN-04
 * (localStorage passwords) remediation from the security audit.
 */

import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Environment variable name for the admin API key.
 * Set this in the Convex dashboard under Settings > Environment Variables.
 */
const ADMIN_KEY_ENV_VAR = "CONVEX_ADMIN_KEY";

/**
 * Authenticated user information returned by requireAuth.
 */
export type AuthenticatedUser = {
  userId: string;
  email: string;
  name: string;
};

/**
 * Error thrown when authentication fails.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Validates authentication using either JWT (frontend) or API key (batch scripts).
 * Returns user information on success, throws AuthError on failure.
 *
 * Authentication flow:
 * 1. If apiKey is provided, validate against CONVEX_ADMIN_KEY
 * 2. Otherwise, check for Convex identity via ctx.auth.getUserIdentity()
 * 3. Throw AuthError if neither authentication method succeeds
 *
 * @param ctx - Convex mutation context (provides access to auth and env vars)
 * @param apiKey - Optional API key for batch script authentication
 * @returns Authenticated user information
 * @throws AuthError if authentication fails
 */
export async function requireAuth(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string
): Promise<AuthenticatedUser> {
  // API key authentication for batch scripts
  if (apiKey) {
    const adminKey = process.env[ADMIN_KEY_ENV_VAR];

    if (!adminKey) {
      console.warn(
        `[AUTH WARNING] ${ADMIN_KEY_ENV_VAR} environment variable not set. ` +
          "API key authentication is disabled."
      );
      throw new AuthError("API key authentication not configured");
    }

    if (!timingSafeEqual(apiKey, adminKey)) {
      throw new AuthError("Authentication failed: Invalid API key");
    }

    return {
      userId: "api-key",
      email: "system@dosewiki.internal",
      name: "API Key",
    };
  }

  // Convex identity authentication for frontend users
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    // SECURITY: Always require authentication - no dev mode bypass
    throw new AuthError("Authentication required: Please sign in or provide an API key");
  }

  return {
    userId: identity.subject,
    email: identity.email ?? "unknown@dosewiki.internal",
    name: identity.name ?? identity.email ?? "Unknown User",
  };
}

/**
 * Optional authentication - returns user info if authenticated, null otherwise.
 * Does not throw on authentication failure.
 *
 * @param ctx - Convex mutation context
 * @param apiKey - Optional API key
 * @returns Authenticated user info or null
 */
export async function optionalAuth(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string
): Promise<AuthenticatedUser | null> {
  try {
    return await requireAuth(ctx, apiKey);
  } catch (error) {
    if (error instanceof AuthError) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if the current user is authenticated without throwing.
 *
 * @param ctx - Convex context
 * @param apiKey - Optional API key
 * @returns true if authenticated, false otherwise
 */
export async function isAuthenticated(
  ctx: MutationCtx | QueryCtx,
  apiKey?: string
): Promise<boolean> {
  const user = await optionalAuth(ctx, apiKey);
  return user !== null;
}

/**
 * Performs constant-time string comparison to prevent timing attacks.
 * Returns true if strings are equal, false otherwise.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  const paddedA = a.padEnd(maxLength, "\0");
  const paddedB = b.padEnd(maxLength, "\0");

  let result = a.length ^ b.length;
  for (let i = 0; i < maxLength; i++) {
    result |= paddedA.charCodeAt(i) ^ paddedB.charCodeAt(i);
  }

  return result === 0;
}
