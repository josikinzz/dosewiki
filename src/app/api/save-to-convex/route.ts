import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { saveRevalidationPaths } from "../../../../convex/lib/saveRevalidationPaths";
import { truncateDiffMarkdown } from "../../../../lib/proposals/diffMarkdown";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateSavedPaths } from "./revalidateSavedPaths";
import { parseCopyIndexPublicationInput } from "../dev/copyIndexPublicationInput";
import {
  buildArticlePathsFromWriteOutcomes,
  buildArticleVerificationFromWriteOutcome,
  deriveSubmittedBy,
  parseChangelogPayload,
  parseIndexLayoutPayloads,
  countFieldsStrippedForConvexMutation,
  sanitizeArticleForConvexMutation,
  summarizeArticleForDebug,
  type ArticleWriteOutcome,
  type ChangelogArticle,
} from "./saveToConvexUtils";

export const runtime = "nodejs";

const MAX_SAVE_PAYLOAD_BYTES = 20 * 1024 * 1024;

type SaveToConvexBody = {
  articles?: unknown;
  indexLayouts?: unknown;
  changelog?: unknown;
};

type SaveToConvexPhase =
  | "initializing"
  | "article-mutation"
  | "index-layout-mutation"
  | "changelog-mutation"
  | "revalidation";

function buildEntryId(now: Date): string {
  return `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now
    .toTimeString()
    .slice(0, 8)
    .replace(/:/g, "")}-${Math.random().toString(16).slice(2, 10)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSafeConvexSaveError(error: unknown): {
  status: number;
  code: string;
  error: string;
  details: string[];
} {
  const message = getErrorMessage(error);

  if (message.includes("Editor access required")) {
    return {
      status: 403,
      code: "convex_editor_access_required",
      error: "Editor access required for Convex writes.",
      details: [
        "The signed-in account authenticated with Next.js, but Convex does not have an admin/editor membership for that email.",
      ],
    };
  }

  if (message.includes("Authentication failed: Invalid API key")) {
    return {
      status: 500,
      code: "convex_admin_key_invalid",
      error: "Convex write authentication failed.",
      details: [
        "The server Convex admin token does not match the target Convex deployment.",
      ],
    };
  }

  if (message.includes("API key authentication not configured")) {
    return {
      status: 500,
      code: "convex_admin_key_unconfigured",
      error: "Convex write authentication is not configured.",
      details: [
        "The target Convex deployment is missing CONVEX_ADMIN_KEY or the scoped editor article write token.",
      ],
    };
  }

  if (message.includes("ArgumentValidationError") || message.includes("Value does not match validator")) {
    return {
      status: 400,
      code: "convex_validation_failed",
      error: "Convex rejected the save payload.",
      details: [message.slice(0, 700)],
    };
  }

  return {
    status: 500,
    code: "convex_save_failed",
    error: "Unable to save to Convex right now.",
    details: [message.slice(0, 700)],
  };
}

// Admin floor: editors stage the same payload through /api/dev/proposals and an
// admin applies it; only an admin writes production directly from the panel.
export const POST = protectedRouteOperation<SaveToConvexBody>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: MAX_SAVE_PAYLOAD_BYTES,
  },
  capabilities: [
    {
      type: "convexWrite",
      errorMessage: (failure) =>
        failure.missing.includes("adminKey")
          ? "Convex admin key is not configured on the server. Set CONVEX_ADMIN_KEY in the Vercel project environment for this deployment."
          : failure.message,
    },
  ],
  unexpectedErrorLabel: "Failed to save to Convex via Next route:",
  unexpectedErrorMessage: "Unable to save to Convex right now.",
  operation: async ({ request, auth, actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const requestId = `save-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

    const rawArticles = Array.isArray(body.articles) ? body.articles : [];
    const articles = rawArticles.map(sanitizeArticleForConvexMutation);
    const indexLayouts = parseIndexLayoutPayloads(body.indexLayouts);
    const changelog = parseChangelogPayload(body.changelog);
    if (indexLayouts.some((layout) => !Object.prototype.hasOwnProperty.call(layout, "expected"))) {
      return NextResponse.json({ error: "Every index layout needs its loaded baseline. Reload the editor source before publishing." }, { status: 400 });
    }
    for (const layout of indexLayouts) parseCopyIndexPublicationInput(layout);
    const articleSummaries = articles.map((article, index) => summarizeArticleForDebug(article, index));
    const strippedArticleFieldCount = rawArticles.reduce(
      (count, article) => count + countFieldsStrippedForConvexMutation(article),
      0,
    );

    if (articles.length === 0 && indexLayouts.length === 0) {
      return NextResponse.json({ error: "No Convex-compatible changes to save." }, { status: 400 });
    }

    const submittedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const { adminKey, client } = convexWrite;
    const editorArticleWriteToken =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? adminKey;
    const savedItems: string[] = [];
    const warnings: string[] = [];
    const publishedLayoutTypes: string[] = [];
    let phase: SaveToConvexPhase = "initializing";

    console.info("[save-to-convex] request:start", {
      requestId,
      submittedBy,
      contentLength: request.headers.get("content-length"),
      articleCount: articleSummaries.length,
      indexLayoutCount: indexLayouts.length,
      hasChangelog: changelog !== null,
      strippedArticleFieldCount,
      articles: articleSummaries,
    });

    try {
      let articleResult:
        | {
            created: number;
            updated: number;
            skipped?: number;
            errors: string[];
            outcomes?: ArticleWriteOutcome[];
            affectedPaths?: string[];
          }
        | undefined;

      if (articles.length > 0) {
        phase = "article-mutation";
        articleResult = await client.mutation(api.substanceIndex.saveSubstances, {
          apiKey: editorArticleWriteToken,
          actorEmail,
          articles: articles as never,
        });

        const savedArticleCount = articleResult.created + articleResult.updated;
        if (savedArticleCount > 0) {
          savedItems.push(`${savedArticleCount} article(s)`);
        }

        if (articleResult.errors.length > 0) {
          warnings.push(...articleResult.errors);
        }

        console.info("[save-to-convex] request:article-mutation", {
          requestId,
          articleResult,
        });
      }

      if (indexLayouts.length > 0) {
        phase = "index-layout-mutation";
        let confirmed = 0;
        for (const layout of indexLayouts) {
          // indexLayouts.save mirrors psychoactive layouts into the
          // categoryLayout table the public /substances page reads.
          const receipt = await client.mutation(api.indexLayouts.save, {
            apiKey: editorArticleWriteToken,
            actorEmail,
            type: layout.type,
            version: layout.version,
            categories: layout.categories,
            expected: layout.expected,
            expectedRevision: layout.expectedRevision, operationId: layout.operationId,
          });
          if (!receipt.unchanged) {
            confirmed += 1;
            publishedLayoutTypes.push(layout.type);
          }
        }

        savedItems.push(confirmed ? `${confirmed} index layout publication receipt(s) confirmed` : "Index layouts unchanged; no publication needed");
      }

      let entry:
        | {
            id: string;
            createdAt: string;
            commit: {
              sha: string;
              url: string;
              message: string;
            };
            articles: ChangelogArticle[];
            markdown: string;
            submittedBy: string | null;
          }
        | undefined;

      const savedArticleCount = articleResult ? articleResult.created + articleResult.updated : 0;
      const articleOutcomes = articleResult?.outcomes ?? [];
      const verification = articleOutcomes.map(buildArticleVerificationFromWriteOutcome);

      const articlePaths =
        articleOutcomes.length > 0
          ? buildArticlePathsFromWriteOutcomes(articleOutcomes)
          : articleResult?.affectedPaths ?? [];
      const uniqueRevalidatedPaths = saveRevalidationPaths(
        articlePaths,
        publishedLayoutTypes as (typeof indexLayouts)[number]["type"][],
      );

      if (savedArticleCount > 0 && changelog) {
        phase = "changelog-mutation";
        const now = new Date();
        const createdAt = now.toISOString();
        const message = `Dev editor update - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        const markdown = truncateDiffMarkdown(changelog.markdown);
        const entryId = buildEntryId(now);

        await client.mutation(api.changelog.addEntry, {
          apiKey: editorArticleWriteToken,
          actorEmail,
          entryId,
          createdAt,
          message,
          markdown,
          submittedBy,
          articles: changelog.articles,
        });

        entry = {
          id: entryId,
          createdAt,
          commit: {
            sha: "",
            url: "",
            message,
          },
          articles: changelog.articles,
          markdown,
          submittedBy,
        };
      }

      phase = "revalidation";
      // The Convex write is already durable here. A public deployment that
      // refuses or drops its refresh is reported as an unpublished target, not
      // raised as a save failure that would invite a duplicate write.
      const savedRevisions = articleOutcomes.flatMap((outcome) =>
        outcome.action !== "skipped" && outcome.publicRevision && outcome.next?.slug
          ? [{ slug: outcome.next.slug, revision: outcome.publicRevision }] : []);
      const publication = await revalidateSavedPaths(uniqueRevalidatedPaths, "save-to-convex", savedRevisions);
      const unpublishedTargets = publication.filter(
        (receipt) => receipt.status !== "accepted" || receipt.verification === "incomplete",
      );
      if (unpublishedTargets.length > 0) {
        console.warn("[save-to-convex] request:publication-incomplete", {
          requestId,
          unpublishedTargets,
        });
      }

      console.info("[save-to-convex] request:complete", {
        requestId,
        savedItems,
        warnings,
        articleResult,
        verification,
        revalidatedPaths: uniqueRevalidatedPaths,
        publication,
        entryId: entry?.id ?? null,
      });

      if (savedItems.length === 0 && warnings.length > 0) {
        return NextResponse.json(
          {
            error: "Unable to save article changes to Convex.",
            details: warnings,
            requestId,
            phase,
            code: "article_ingestion_failed",
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        requestId,
        savedItems,
        submittedBy,
        warnings,
        articleResult,
        entry,
        verification,
        revalidatedPaths: uniqueRevalidatedPaths,
        publication,
      });
    } catch (error) {
      const safeError = getSafeConvexSaveError(error);
      console.error("[save-to-convex] request:failed", {
        requestId,
        phase,
        code: safeError.code,
        error: getErrorMessage(error),
        articles: articleSummaries,
      });
      return NextResponse.json(
        {
          error: safeError.error,
          details: safeError.details,
          requestId,
          phase,
          code: safeError.code,
        },
        { status: safeError.status },
      );
    }
  },
});
