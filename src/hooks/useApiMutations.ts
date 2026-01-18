import { useMutation } from "@tanstack/react-query";
import { useMutation as useConvexMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";

// ============================================================================
// Types
// ============================================================================

export interface AuthPayload {
  username: string;
  password: string;
}

export interface AuthResult {
  authorized: boolean;
  key: string;
  error?: string;
}

export interface SaveArticlesPayload {
  username: string;
  password: string;
  articlesData: unknown[];
  commitMessage: string;
  changelogMarkdown?: string;
  changedArticles?: unknown[];
  psychoactiveIndexManualData?: unknown;
  chemicalIndexManualData?: unknown;
  mechanismIndexManualData?: unknown;
  aboutMarkdown?: string;
  aboutSubtitleMarkdown?: string;
  aboutConfig?: { founderProfileKeys: string[] };
  generatorPrompt?: string;
  /**
   * When true, skip updating articles.json in GitHub.
   * Use when articles are managed via Convex instead.
   */
  skipArticles?: boolean;
}

export interface SaveArticlesResult {
  success: boolean;
  commitUrl?: string;
  submittedBy?: string;
  entry?: {
    timestamp: string;
    commit?: {
      sha: string;
      url: string;
      message: string;
    };
    submittedBy?: string;
    articles?: unknown[];
  };
  error?: string;
}

export interface SaveProfilePayload {
  username: string;
  password: string;
  profile: {
    key: string;
    displayName: string;
    bio: string;
    links: Array<{ label: string; url: string }>;
    avatarUrl?: string;
  };
  avatarUpload?: {
    filename: string;
    base64: string;
    mimeType: string;
  };
}

export interface SaveProfileResult {
  success: boolean;
  unchanged?: boolean;
  avatarUrl?: string;
  profile?: {
    key: string;
    displayName: string;
    bio: string;
    links: Array<{ label: string; url: string }>;
    avatarUrl: string | null;
    aliases: string[];
    hasCustomBio: boolean;
  };
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function verifyAuth(payload: AuthPayload): Promise<AuthResult> {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.authorized !== true) {
    const error = typeof result.error === "string" ? result.error : "Authentication failed.";
    throw new Error(error);
  }

  return {
    authorized: true,
    key: typeof result.key === "string" && result.key.trim().length > 0
      ? result.key.trim()
      : payload.username,
  };
}

async function saveArticles(payload: SaveArticlesPayload): Promise<SaveArticlesResult> {
  console.log("[saveArticles] Starting save request...");
  console.log("[saveArticles] Payload size:", JSON.stringify(payload).length, "bytes");
  console.log("[saveArticles] Articles count:", payload.articlesData?.length ?? 0);

  let response: Response;
  try {
    response = await fetch("/api/save-substance-index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    console.error("[saveArticles] Network error - fetch failed:", networkError);
    console.error("[saveArticles] This usually means:");
    console.error("  - The API endpoint is not deployed/reachable");
    console.error("  - CORS issues");
    console.error("  - Network connectivity problems");
    throw new Error(`Network error: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
  }

  console.log("[saveArticles] Response status:", response.status, response.statusText);

  const result = await response.json().catch((parseError) => {
    console.error("[saveArticles] Failed to parse response JSON:", parseError);
    return {};
  });

  console.log("[saveArticles] Response body:", result);

  if (!response.ok) {
    const error = result.details || result.error || "Failed to save articles.";
    console.error("[saveArticles] Server returned error:", error);
    throw new Error(typeof error === "string" ? error : "Failed to save articles.");
  }

  console.log("[saveArticles] Success! Commit URL:", result.commitUrl);

  return {
    success: true,
    commitUrl: typeof result.commitUrl === "string" ? result.commitUrl : undefined,
    submittedBy: typeof result.submittedBy === "string" ? result.submittedBy : undefined,
    entry: result.entry,
  };
}

async function saveProfile(payload: SaveProfilePayload): Promise<SaveProfileResult> {
  const response = await fetch("/api/save-user-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = typeof result.error === "string" ? result.error : "Unable to save profile.";
    throw new Error(error);
  }

  return {
    success: true,
    unchanged: result.unchanged === true,
    avatarUrl: typeof result.avatarUrl === "string" ? result.avatarUrl : undefined,
    profile: result.profile,
  };
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Mutation hook for verifying admin credentials.
 * Returns the verified credentials key on success.
 */
export function useAuthMutation() {
  return useMutation({
    mutationFn: verifyAuth,
  });
}

/**
 * Mutation hook for saving articles to GitHub.
 * Handles articles, changelog, indexes, and about content.
 */
export function useSaveArticlesMutation() {
  return useMutation({
    mutationFn: saveArticles,
  });
}

/**
 * Mutation hook for saving user profile to GitHub.
 * Handles profile data and avatar uploads.
 */
export function useSaveProfileMutation() {
  return useMutation({
    mutationFn: saveProfile,
  });
}

// ============================================================================
// Convex Mutation Hooks
// ============================================================================

/**
 * Mutation hook for saving articles to Convex.
 * Returns null if Convex is not enabled.
 */
export function useSaveArticlesToConvex() {
  const enabled = isConvexEnabled();
  const convexMutation = useConvexMutation(api.articles.saveArticles);

  if (!enabled) {
    return null;
  }

  return {
    mutate: convexMutation,
    isEnabled: enabled,
  };
}

/**
 * Mutation hook for replacing all articles in Convex.
 * Use for bulk sync operations.
 */
export function useReplaceAllArticlesInConvex() {
  const enabled = isConvexEnabled();
  const convexMutation = useConvexMutation(api.articles.replaceAllArticles);

  if (!enabled) {
    return null;
  }

  return {
    mutate: convexMutation,
    isEnabled: enabled,
  };
}

/**
 * Mutation hook for saving changelog entries to Convex.
 * Returns null if Convex is not enabled.
 */
export function useSaveChangelogToConvex() {
  const enabled = isConvexEnabled();
  const convexMutation = useConvexMutation(api.changelog.addEntry);

  if (!enabled) {
    return null;
  }

  return {
    mutate: convexMutation,
    isEnabled: enabled,
  };
}
