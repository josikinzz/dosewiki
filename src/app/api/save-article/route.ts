import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { saveRevalidationPaths } from "../../../../server/lib/saveRevalidationPaths";
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
  countFieldsStrippedForDataMutation,
  sanitizeArticleForDataMutation,
  summarizeArticleForDebug,
  type ArticleWriteOutcome,
  type ChangelogArticle,
} from "./saveArticleUtils";

export const runtime = "nodejs";

const MAX_SAVE_PAYLOAD_BYTES = 20 * 1024 * 1024;

type SaveArticleBody = {
  articles?: unknown;
  indexLayouts?: unknown;
  changelog?: unknown;
};

type SaveArticlePhase =
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

function getSafeDataSaveError(error: unknown): {
  status: number;
  code: string;
  error: string;
  details: string[];
} {
  const message = getErrorMessage(error);

  if (message.includes("Editor access required")) {
    return {
      status: 403,
      code: "data_editor_access_required",
      error: "Editor access required for Postgres writes.",
      details: [
        "The signed-in account authenticated with Next.js, but Postgres does not have an admin/editor membership for that email.",
      ],
    };
  }

  if (message.includes("Authentication failed: Invalid API key")) {
    return {
      status: 500,
      code: "data_admin_key_invalid",
      error: "Postgres write authentication failed.",
      details: [
        "The server Postgres admin token does not match the target Postgres deployment.",
      ],
    };
  }

  if (message.includes("API key authentication not configured")) {
    return {
      status: 500,
      code: "data_admin_key_unconfigured",
      error: "Postgres write authentication is not configured.",
      details: [
        "The target Postgres deployment is missing DATA_ADMIN_KEY or the scoped editor article write token.",
      ],
    };
  }

  if (message.includes("ArgumentValidationError") || message.includes("Value does not match validator")) {
    return {
      status: 400,
      code: "data_validation_failed",
      error: "Postgres rejected the save payload.",
      details: [message.slice(0, 700)],
    };
  }

  return {
    status: 500,
    code: "data_save_failed",
    error: "Unable to save to Postgres right now.",
    details: [message.slice(0, 700)],
  };
}

// Admin floor: editors stage the same payload through /api/dev/proposals and an
// admin applies it; only an admin writes production directly from the panel.
export const POST = protectedRouteOperation<SaveArticleBody>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: MAX_SAVE_PAYLOAD_BYTES,
  },
  capabilities: [
    {
      type: "dataWrite",
      errorMessage: (failure) =>
        failure.missing.includes("adminKey")
          ? "Postgres admin key is not configured on the server. Set DATA_ADMIN_KEY in the Vercel project environment for this deployment."
          : failure.message,
    },
  ],
  unexpectedErrorLabel: "Failed to save to Postgres via Next route:",
  unexpectedErrorMessage: "Unable to save to Postgres right now.",
  operation: async ({ request, auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const requestId = `save-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

    const rawArticles = Array.isArray(body.articles) ? body.articles : [];
    const articles = rawArticles.map(sanitizeArticleForDataMutation);
    const indexLayouts = parseIndexLayoutPayloads(body.indexLayouts);
    const changelog = parseChangelogPayload(body.changelog);
    if (indexLayouts.some((layout) => !Object.prototype.hasOwnProperty.call(layout, "expected"))) {
      return NextResponse.json({ error: "Every index layout needs its loaded baseline. Reload the editor source before publishing." }, { status: 400 });
    }
    for (const layout of indexLayouts) parseCopyIndexPublicationInput(layout);
    const articleSummaries = articles.map((article, index) => summarizeArticleForDebug(article, index));
    const strippedArticleFieldCount = rawArticles.reduce(
      (count, article) => count + countFieldsStrippedForDataMutation(article),
      0,
    );

    if (articles.length === 0 && indexLayouts.length === 0) {
      return NextResponse.json({ error: "No Postgres-compatible changes to save." }, { status: 400 });
    }

    const submittedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const { adminKey, client } = dataWrite;
    const editorArticleWriteToken =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? adminKey;
    const savedItems: string[] = [];
    const warnings: string[] = [];
    const publishedLayoutTypes: string[] = [];
    let phase: SaveArticlePhase = "initializing";

    console.info("[save-article] request:start", {
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

        console.info("[save-article] request:article-mutation", {
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
      const articleDependencies = Object.fromEntries(articleOutcomes.flatMap((outcome) => {
        const dependency = outcome.publicationDependency ?? "membership";
        return [outcome.previous?.slug, outcome.next?.slug]
          .filter((slug): slug is string => Boolean(slug))
          .map((slug) => [slug, dependency] as const);
      }));
      const hasMembershipChange = Object.values(articleDependencies).some((value) => value === "membership");
      const uniqueRevalidatedPaths = saveRevalidationPaths(
        articlePaths,
        publishedLayoutTypes as (typeof indexLayouts)[number]["type"][],
      ).filter((path) =>
        path !== "/substances" || hasMembershipChange || publishedLayoutTypes.length > 0);

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
      // The Postgres write is already durable here. A public deployment that
      // refuses or drops its refresh is reported as an unpublished target, not
      // raised as a save failure that would invite a duplicate write.
      const savedRevisions = articleOutcomes.flatMap((outcome) =>
        outcome.action !== "skipped" && outcome.publicRevision && outcome.next?.slug
          ? [{ slug: outcome.next.slug, revision: outcome.publicRevision }] : []);
      const publication = await revalidateSavedPaths(
        uniqueRevalidatedPaths,
        "save-article",
        savedRevisions,
        articleDependencies,
      );
      const unpublishedTargets = publication.filter(
        (receipt) => receipt.status !== "accepted" || receipt.verification === "incomplete",
      );
      if (unpublishedTargets.length > 0) {
        console.warn("[save-article] request:publication-incomplete", {
          requestId,
          unpublishedTargets,
        });
      }

      console.info("[save-article] request:complete", {
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
            error: "Unable to save article changes to Postgres.",
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
      const safeError = getSafeDataSaveError(error);
      console.error("[save-article] request:failed", {
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
