import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { readJsonBody, JsonBodyError } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteClient } from "@server/convex/serverClient";
import { getServerConvexAdminKey } from "@server/convex/serverWriteHealth";
import {
  buildArticlePathsForRevalidation,
  buildArticleVerification,
  deriveSubmittedBy,
  parseAboutPayload,
  parseChangelogPayload,
  summarizeArticleForDebug,
  toArticleSnapshot,
  type ArticleDebugSummary,
  type ArticleSnapshot,
  type ArticleVerification,
  type ChangelogArticle,
} from "./saveToConvexUtils";

export const runtime = "nodejs";

const MAX_SAVE_PAYLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MARKDOWN_SIZE = 500_000;

type SaveToConvexBody = {
  articles?: unknown;
  about?: unknown;
  changelog?: unknown;
};

function buildEntryId(now: Date): string {
  return `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now
    .toTimeString()
    .slice(0, 8)
    .replace(/:/g, "")}-${Math.random().toString(16).slice(2, 10)}`;
}

async function findArticleSnapshot(
  client: ReturnType<typeof getServerConvexWriteClient>,
  summary: ArticleDebugSummary,
): Promise<ArticleSnapshot | null> {
  if (summary.id !== null) {
    const byId = await client.query(api.substanceIndex.getById, { id: summary.id });
    if (byId) {
      return toArticleSnapshot(byId);
    }
  }

  const slug = summary.requestedSlug ?? summary.fallbackSlug;
  if (!slug) {
    return null;
  }

  const bySlug = await client.query(api.substanceIndex.getBySlug, { slug });
  return toArticleSnapshot(bySlug);
}

async function verifySavedArticle(
  client: ReturnType<typeof getServerConvexWriteClient>,
  summary: ArticleDebugSummary,
  previous: ArticleSnapshot | null,
): Promise<ArticleVerification> {
  const stored = await findArticleSnapshot(client, summary);
  return buildArticleVerification(summary, previous, stored);
}

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, { windowMs: 60_000, max: 5 });
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const adminKey = getServerConvexAdminKey();
  if (!adminKey) {
    return NextResponse.json(
      {
        error:
          "Convex admin key is not configured on the server. Set CONVEX_ADMIN_KEY in the Vercel project environment for this deployment.",
      },
      { status: 500 },
    );
  }

  try {
    const requestId = `save-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const body = await readJsonBody<SaveToConvexBody>(request, {
      maxBytes: MAX_SAVE_PAYLOAD_BYTES,
    });

    const articles = Array.isArray(body.articles) ? body.articles : [];
    const about = parseAboutPayload(body.about);
    const changelog = parseChangelogPayload(body.changelog);
    const articleSummaries = articles.map((article, index) => summarizeArticleForDebug(article, index));

    if (articles.length === 0 && !about) {
      return NextResponse.json({ error: "No Convex-compatible changes to save." }, { status: 400 });
    }

    const submittedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const client = getServerConvexWriteClient();
    const savedItems: string[] = [];
    const warnings: string[] = [];
    const previousByTarget = new Map<string, ArticleSnapshot | null>();

    if (articleSummaries.length > 0) {
      const previousSnapshots = await Promise.all(
        articleSummaries.map(async (summary) => [summary.target, await findArticleSnapshot(client, summary)] as const),
      );

      previousSnapshots.forEach(([target, snapshot]) => {
        previousByTarget.set(target, snapshot);
      });
    }

    console.info("[save-to-convex] request:start", {
      requestId,
      submittedBy,
      contentLength: request.headers.get("content-length"),
      articleCount: articleSummaries.length,
      hasAbout: about !== null,
      hasChangelog: changelog !== null,
      articles: articleSummaries,
      previousArticles: articleSummaries.map((summary) => ({
        target: summary.target,
        existingSlug: previousByTarget.get(summary.target)?.slug ?? null,
        existingTitle: previousByTarget.get(summary.target)?.title ?? null,
      })),
    });

    if (about) {
      await client.mutation(api.siteConfig.saveAbout, {
        apiKey: adminKey,
        aboutMarkdown: about.aboutMarkdown,
        aboutSubtitle: about.aboutSubtitle,
        founderProfileKeys: about.founderProfileKeys,
        updatedBy: submittedBy,
      });
      savedItems.push("About page");
    }

    let articleResult:
      | {
          created: number;
          updated: number;
          errors: string[];
        }
      | undefined;

    if (articles.length > 0) {
      articleResult = await client.mutation(api.substanceIndex.saveSubstances, {
        apiKey: adminKey,
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
    const verification =
      savedArticleCount > 0
        ? await Promise.all(
            articleSummaries.map((summary) => verifySavedArticle(client, summary, previousByTarget.get(summary.target) ?? null)),
          )
        : [];

    const revalidatedPaths = buildArticlePathsForRevalidation(articleSummaries, previousByTarget, verification);

    if (about) {
      revalidatedPaths.push("/about");
    }

    const uniqueRevalidatedPaths = Array.from(new Set(revalidatedPaths)).sort((left, right) =>
      left.localeCompare(right),
    );

    if (savedArticleCount > 0 && changelog) {
      const now = new Date();
      const createdAt = now.toISOString();
      const message = `Dev editor update - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
      const markdown =
        changelog.markdown.length > MAX_MARKDOWN_SIZE
          ? `${changelog.markdown.slice(0, MAX_MARKDOWN_SIZE)}\n\n... [Diff truncated - too large to store]`
          : changelog.markdown;
      const entryId = buildEntryId(now);

      await client.mutation(api.changelog.addEntry, {
        apiKey: adminKey,
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

    uniqueRevalidatedPaths.forEach((path) => {
      revalidatePath(path);
    });

    console.info("[save-to-convex] request:complete", {
      requestId,
      savedItems,
      warnings,
      articleResult,
      verification,
      revalidatedPaths: uniqueRevalidatedPaths,
      entryId: entry?.id ?? null,
    });

    if (savedItems.length === 0 && warnings.length > 0) {
      return NextResponse.json(
        {
          error: "Unable to save article changes to Convex.",
          details: warnings,
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
    });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to save to Convex via Next route:", error);
    return NextResponse.json({ error: "Unable to save to Convex right now." }, { status: 500 });
  }
}
