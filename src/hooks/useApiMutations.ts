import { useMutation } from "@tanstack/react-query";

// ============================================================================
// Types
// ============================================================================

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
   * When true, skip updating SubstanceIndex.json in GitHub.
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

export interface SaveToConvexPayload {
  articles?: unknown[];
  about?: {
    aboutMarkdown?: string;
    aboutSubtitle?: string;
    founderProfileKeys?: string[];
  };
  changelog?: {
    markdown: string;
    articles: Array<{
      id: number;
      title: string;
      slug: string;
    }>;
  };
}

export interface SaveToConvexResult {
  success: boolean;
  savedItems: string[];
  submittedBy?: string;
  warnings?: string[];
  articleResult?: {
    created: number;
    updated: number;
    errors: string[];
  };
  entry?: {
    id: string;
    createdAt: string;
    commit: {
      sha: string;
      url: string;
      message: string;
    };
    articles: Array<{
      id: number;
      title: string;
      slug: string;
    }>;
    markdown: string;
    submittedBy: string | null;
  };
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

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

async function saveToConvex(payload: SaveToConvexPayload): Promise<SaveToConvexResult> {
  const response = await fetch("/api/save-to-convex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = Array.isArray(result.details)
      ? result.details.filter((value): value is string => typeof value === "string")
      : [];
    const error = typeof result.error === "string" ? result.error : "Unable to save to Convex.";
    throw new Error(details.length > 0 ? `${error} ${details.join(" ")}`.trim() : error);
  }

  return {
    success: true,
    savedItems: Array.isArray(result.savedItems)
      ? result.savedItems.filter((value): value is string => typeof value === "string")
      : [],
    submittedBy: typeof result.submittedBy === "string" ? result.submittedBy : undefined,
    warnings: Array.isArray(result.warnings)
      ? result.warnings.filter((value): value is string => typeof value === "string")
      : [],
    articleResult:
      result.articleResult && typeof result.articleResult === "object"
        ? {
            created: Number((result.articleResult as { created?: unknown }).created ?? 0),
            updated: Number((result.articleResult as { updated?: unknown }).updated ?? 0),
            errors: Array.isArray((result.articleResult as { errors?: unknown[] }).errors)
              ? (result.articleResult as { errors: unknown[] }).errors.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
          }
        : undefined,
    entry:
      result.entry && typeof result.entry === "object"
        ? {
            id: typeof result.entry.id === "string" ? result.entry.id : "",
            createdAt: typeof result.entry.createdAt === "string" ? result.entry.createdAt : "",
            commit: {
              sha: typeof result.entry.commit?.sha === "string" ? result.entry.commit.sha : "",
              url: typeof result.entry.commit?.url === "string" ? result.entry.commit.url : "",
              message:
                typeof result.entry.commit?.message === "string" ? result.entry.commit.message : "",
            },
            articles: Array.isArray(result.entry.articles)
              ? result.entry.articles.filter(
                  (value: unknown): value is { id: number; title: string; slug: string } =>
                    typeof value === "object" &&
                    value !== null &&
                    typeof (value as { id?: unknown }).id === "number" &&
                    typeof (value as { title?: unknown }).title === "string" &&
                    typeof (value as { slug?: unknown }).slug === "string",
                )
              : [],
            markdown: typeof result.entry.markdown === "string" ? result.entry.markdown : "",
            submittedBy:
              typeof result.entry.submittedBy === "string" ? result.entry.submittedBy : null,
          }
        : undefined,
  };
}

// ============================================================================
// Mutation Hooks
// ============================================================================

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

export function useSaveToConvexMutation() {
  return useMutation({
    mutationFn: saveToConvex,
  });
}
