import { isDataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { dataRejectionResponse } from "@/lib/http/dataRejection";
import { PostgresError } from "@server/postgres/runtime/values";
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { saveRevalidationPaths } from "../../../../server/lib/saveRevalidationPaths";
import { truncateDiffMarkdown } from "../../../../lib/proposals/diffMarkdown";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateSavedPaths } from "./revalidateSavedPaths";
import {
  buildArticlePathsFromWriteOutcomes,
  buildArticleVerificationFromWriteOutcome,
  deriveSubmittedBy,
  parseChangelogPayload,
  parseIndexLayoutPayloads,
  countFieldsStrippedForDataMutation,
  sanitizeArticleForDataMutation,
  summarizeArticleForDebug,
} from "./saveArticleUtils";

export const runtime = "nodejs";

const MAX_SAVE_PAYLOAD_BYTES = 20 * 1024 * 1024;

type SaveArticleBody = {
  operationId?: unknown;
  articleAdmissions?: unknown;
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

    if (typeof body.operationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_-]{7,159}$/.test(body.operationId)) {
      return NextResponse.json({ error: "A stable batch operation ID is required." }, { status: 400 });
    }
    const operationId = body.operationId;
    const requestId = `save-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

    const rawArticles = Array.isArray(body.articles) ? body.articles : [];
    const articles = rawArticles.map(sanitizeArticleForDataMutation);
    const admissions = Array.isArray(body.articleAdmissions) ? body.articleAdmissions : [];
    const commands = articles.map((article) => {
      const admission = admissions.find((value) => value && typeof value === "object" && value.slug === (article && typeof article === "object" && "slug" in article ? article.slug : undefined));
      if (!admission || (admission.kind !== "create" && (admission.kind !== "replace-existing" || typeof admission.baseHash !== "string" || !admission.baseHash))) {
        throw new PostgresError({ code: "ARTICLE_BASELINE_REQUIRED", message: "Every article requires its loaded revision or explicit create-only admission. Your draft is preserved." });
      }
      return admission.kind === "create" ? { kind: "create" as const, article } : { kind: "replace-existing" as const, baseHash: admission.baseHash, article };
    });
    const indexLayouts = parseIndexLayoutPayloads(body.indexLayouts).map(({ type, version, categories, expected, expectedRevision }) => ({ type, version, categories, expected, expectedRevision }));
    const changelog = parseChangelogPayload(body.changelog);
    if (indexLayouts.some((layout) => !Object.prototype.hasOwnProperty.call(layout, "expected"))) {
      return NextResponse.json({ error: "Every index layout needs its loaded baseline. Reload the editor source before publishing." }, { status: 400 });
    }
    if (indexLayouts.some(layout => !Number.isSafeInteger(layout.expectedRevision) || layout.expectedRevision! < 0)) {
      return NextResponse.json({ error: "Every index layout needs its loaded publication revision." }, { status: 400 });
    }
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
      const changelogInput = changelog ? { markdown: truncateDiffMarkdown(changelog.markdown), articles: changelog.articles } : undefined;
      phase = "article-mutation";
      const batch = await client.mutation(api.saveArticleBatch.save, {
        apiKey: editorArticleWriteToken,
        actorEmail,
        operationId,
        articles: commands as never,
        indexLayouts: indexLayouts as never,
        changelog: changelogInput,
      });
      const articleResult = batch.articleResult ?? undefined;
      if (articleResult) {
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
        for (const { type, receipt } of batch.layoutResults) if (!receipt.unchanged) publishedLayoutTypes.push(type);
        const confirmedLayoutCount = publishedLayoutTypes.length;
        savedItems.push(confirmedLayoutCount ? `${confirmedLayoutCount} index layout publication receipt(s) confirmed` : "Index layouts unchanged; no publication needed");
      }

      const entry = batch.changelog ? {
        id: batch.changelog.entryId, createdAt: batch.changelog.createdAt,
        commit: { sha: "", url: "", message: batch.changelog.message },
        articles: batch.changelog.articles, markdown: batch.changelog.markdown,
        submittedBy: batch.changelog.submittedBy,
      } : undefined;

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
        version: batch.version,
        operationId: batch.operationId,
        articleReceipts: batch.articleReceipts,
        layoutReceipts: batch.layoutResults,
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
      if (isDataWriteFrozenError(error)) throw error;
      const rejection = dataRejectionResponse(error);
      if (rejection) return rejection;
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
