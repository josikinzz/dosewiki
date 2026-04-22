import { useMutation } from "@tanstack/react-query";
import { pickString, pickStringArray, postJson } from "./apiMutationClient";

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
  requestId?: string;
  savedItems: string[];
  submittedBy?: string;
  warnings?: string[];
  articleResult?: {
    created: number;
    updated: number;
    errors: string[];
  };
  verification?: Array<{
    target: string;
    found: boolean;
    previousSlug: string | null;
    requestedSlug: string | null;
    storedSlug: string | null;
    storedTitle: string | null;
    titleMatches: boolean;
    slugMatches: boolean;
  }>;
  revalidatedPaths?: string[];
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

  const { response, result } = await postJson("/api/save-substance-index", {
    body: payload,
    onNetworkError: (networkError) => {
      console.error("[saveArticles] Network error - fetch failed:", networkError);
      console.error("[saveArticles] This usually means:");
      console.error("  - The API endpoint is not deployed/reachable");
      console.error("  - CORS issues");
      console.error("  - Network connectivity problems");
      throw new Error(
        `Network error: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
      );
    },
    onResponse: (nextResponse, nextResult) => {
      console.log("[saveArticles] Response status:", nextResponse.status, nextResponse.statusText);
      console.log("[saveArticles] Response body:", nextResult);
    },
  });

  if (!response.ok) {
    const error = result.details || result.error || "Failed to save articles.";
    console.error("[saveArticles] Server returned error:", error);
    throw new Error(typeof error === "string" ? error : "Failed to save articles.");
  }

  console.log("[saveArticles] Success! Commit URL:", result.commitUrl);

  return {
    success: true,
    commitUrl: pickString(result.commitUrl),
    submittedBy: pickString(result.submittedBy),
    entry:
      result.entry && typeof result.entry === "object"
        ? (result.entry as SaveArticlesResult["entry"])
        : undefined,
  };
}

async function saveProfile(payload: SaveProfilePayload): Promise<SaveProfileResult> {
  const { response, result } = await postJson("/api/save-user-profile", {
    body: payload,
  });

  if (!response.ok) {
    const error = pickString(result.error) ?? "Unable to save profile.";
    throw new Error(error);
  }

  return {
    success: true,
    unchanged: result.unchanged === true,
    avatarUrl: pickString(result.avatarUrl),
    profile:
      result.profile && typeof result.profile === "object"
        ? (result.profile as SaveProfileResult["profile"])
        : undefined,
  };
}

async function saveToConvex(payload: SaveToConvexPayload): Promise<SaveToConvexResult> {
  const payloadSummary = {
    articleCount: payload.articles?.length ?? 0,
    hasAbout: payload.about !== undefined,
    hasChangelog: payload.changelog !== undefined,
    articleTargets: (payload.articles ?? []).map((article, index) => {
      if (!article || typeof article !== "object") {
        return `index:${index}`;
      }

      const candidate = article as { id?: unknown; slug?: unknown; title?: unknown };
      if (typeof candidate.id === "number") {
        return `id:${candidate.id}`;
      }

      if (typeof candidate.slug === "string" && candidate.slug.trim().length > 0) {
        return `slug:${candidate.slug.trim()}`;
      }

      if (typeof candidate.title === "string" && candidate.title.trim().length > 0) {
        return `title:${candidate.title.trim()}`;
      }

      return `index:${index}`;
    }),
  };

  console.info("[saveToConvex] Starting save request", payloadSummary);

  const { response, result } = await postJson("/api/save-to-convex", {
    body: payload,
    onResponse: (nextResponse, nextResult) => {
      console.info("[saveToConvex] Response received", {
        status: nextResponse.status,
        ok: nextResponse.ok,
        requestId: pickString(nextResult.requestId),
        savedItems: pickStringArray(nextResult.savedItems),
        warnings: pickStringArray(nextResult.warnings),
        articleResult: nextResult.articleResult,
        verification: Array.isArray(nextResult.verification) ? nextResult.verification : [],
        revalidatedPaths: pickStringArray(nextResult.revalidatedPaths),
      });
    },
  });

  if (!response.ok) {
    const details = pickStringArray(result.details);
    const error = pickString(result.error) ?? "Unable to save to Convex.";
    throw new Error(details.length > 0 ? `${error} ${details.join(" ")}`.trim() : error);
  }

  return {
    success: true,
    requestId: pickString(result.requestId),
    savedItems: pickStringArray(result.savedItems),
    submittedBy: pickString(result.submittedBy),
    warnings: pickStringArray(result.warnings),
    verification: Array.isArray(result.verification)
      ? result.verification.filter(
          (
            value,
          ): value is {
            target: string;
            found: boolean;
            previousSlug: string | null;
            requestedSlug: string | null;
            storedSlug: string | null;
            storedTitle: string | null;
            titleMatches: boolean;
            slugMatches: boolean;
          } =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as { target?: unknown }).target === "string" &&
            typeof (value as { found?: unknown }).found === "boolean" &&
            typeof (value as { titleMatches?: unknown }).titleMatches === "boolean" &&
            typeof (value as { slugMatches?: unknown }).slugMatches === "boolean",
        )
      : [],
    revalidatedPaths: Array.isArray(result.revalidatedPaths)
      ? result.revalidatedPaths.filter((value): value is string => typeof value === "string")
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
            id: typeof (result.entry as { id?: unknown }).id === "string" ? (result.entry as { id: string }).id : "",
            createdAt:
              typeof (result.entry as { createdAt?: unknown }).createdAt === "string"
                ? (result.entry as { createdAt: string }).createdAt
                : "",
            commit: {
              sha:
                typeof (result.entry as { commit?: { sha?: unknown } }).commit?.sha === "string"
                  ? (result.entry as { commit: { sha: string } }).commit.sha
                  : "",
              url:
                typeof (result.entry as { commit?: { url?: unknown } }).commit?.url === "string"
                  ? (result.entry as { commit: { url: string } }).commit.url
                  : "",
              message:
                typeof (result.entry as { commit?: { message?: unknown } }).commit?.message === "string"
                  ? (result.entry as { commit: { message: string } }).commit.message
                  : "",
            },
            articles: Array.isArray((result.entry as { articles?: unknown }).articles)
              ? (result.entry as { articles: unknown[] }).articles.filter(
                  (value: unknown): value is { id: number; title: string; slug: string } =>
                    typeof value === "object" &&
                    value !== null &&
                    typeof (value as { id?: unknown }).id === "number" &&
                    typeof (value as { title?: unknown }).title === "string" &&
                    typeof (value as { slug?: unknown }).slug === "string",
                )
              : [],
            markdown:
              typeof (result.entry as { markdown?: unknown }).markdown === "string"
                ? (result.entry as { markdown: string }).markdown
                : "",
            submittedBy:
              typeof (result.entry as { submittedBy?: unknown }).submittedBy === "string"
                ? (result.entry as { submittedBy: string }).submittedBy
                : null,
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
