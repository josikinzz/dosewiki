import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { readJsonBody, JsonBodyError } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteCapability } from "@server/convex/serverWriteCapability";
import {
  buildArticlePathsFromWriteOutcomes,
  buildArticleVerificationFromWriteOutcome,
  deriveSubmittedBy,
  parseAboutPayload,
  parseChangelogPayload,
  summarizeArticleForDebug,
  type ArticleWriteOutcome,
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

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "editorHeavyWrite");
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const writeCapability = getServerConvexWriteCapability();
  if (writeCapability.ok === false) {
    return NextResponse.json(
      {
        error:
          writeCapability.failure.missing.includes("adminKey")
            ? "Convex admin key is not configured on the server. Set CONVEX_ADMIN_KEY in the Vercel project environment for this deployment."
            : writeCapability.failure.message,
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
    const { adminKey, client } = writeCapability.capability;
    const editorArticleWriteToken =
      writeCapability.capability.getAdminIntentToken?.("editorArticleWrite") ?? adminKey;
    const savedItems: string[] = [];
    const warnings: string[] = [];

    console.info("[save-to-convex] request:start", {
      requestId,
      submittedBy,
      contentLength: request.headers.get("content-length"),
      articleCount: articleSummaries.length,
      hasAbout: about !== null,
      hasChangelog: changelog !== null,
      articles: articleSummaries,
    });

    if (about) {
      await client.mutation(api.siteConfig.saveAbout, {
        apiKey: editorArticleWriteToken,
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
          skipped?: number;
          errors: string[];
          outcomes?: ArticleWriteOutcome[];
          affectedPaths?: string[];
        }
      | undefined;

    if (articles.length > 0) {
      articleResult = await client.mutation(api.substanceIndex.saveSubstances, {
        apiKey: editorArticleWriteToken,
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
    const articleOutcomes = articleResult?.outcomes ?? [];
    const verification = articleOutcomes.map(buildArticleVerificationFromWriteOutcome);

    const revalidatedPaths =
      articleOutcomes.length > 0
        ? buildArticlePathsFromWriteOutcomes(articleOutcomes)
        : articleResult?.affectedPaths ?? [];

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
        apiKey: editorArticleWriteToken,
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
