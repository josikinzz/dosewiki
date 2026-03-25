import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { readJsonBody, JsonBodyError } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexClient } from "@server/convex/serverClient";

export const runtime = "nodejs";

const MAX_SAVE_PAYLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MARKDOWN_SIZE = 500_000;

type SaveToConvexBody = {
  articles?: unknown;
  about?: unknown;
  changelog?: unknown;
};

type AboutPayload = {
  aboutMarkdown?: string;
  aboutSubtitle?: string;
  founderProfileKeys?: string[];
};

type ChangelogArticle = {
  id: number;
  title: string;
  slug: string;
};

type ChangelogPayload = {
  markdown: string;
  articles: ChangelogArticle[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAboutPayload(value: unknown): AboutPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const aboutMarkdown = typeof value.aboutMarkdown === "string" ? value.aboutMarkdown : undefined;
  const aboutSubtitle = typeof value.aboutSubtitle === "string" ? value.aboutSubtitle : undefined;
  const founderProfileKeys = Array.isArray(value.founderProfileKeys)
    ? value.founderProfileKeys.filter((entry): entry is string => typeof entry === "string")
    : undefined;

  if (aboutMarkdown === undefined && aboutSubtitle === undefined && founderProfileKeys === undefined) {
    return null;
  }

  return {
    aboutMarkdown,
    aboutSubtitle,
    founderProfileKeys,
  };
}

function parseChangelogPayload(value: unknown): ChangelogPayload | null {
  if (!isRecord(value) || typeof value.markdown !== "string" || !Array.isArray(value.articles)) {
    return null;
  }

  const articles = value.articles.filter(
    (entry): entry is ChangelogArticle =>
      isRecord(entry) &&
      typeof entry.id === "number" &&
      typeof entry.title === "string" &&
      typeof entry.slug === "string",
  );

  if (articles.length === 0) {
    return null;
  }

  return {
    markdown: value.markdown,
    articles,
  };
}

function deriveSubmittedBy(email: string, name?: string | null): string {
  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();

  if (normalizedEmailKey) {
    return normalizedEmailKey;
  }

  const normalizedName = name?.trim().replace(/[^a-z0-9-]/gi, "").toUpperCase() ?? "";
  return normalizedName || email.trim().toUpperCase();
}

function buildEntryId(now: Date): string {
  return `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now
    .toTimeString()
    .slice(0, 8)
    .replace(/:/g, "")}-${Math.random().toString(16).slice(2, 10)}`;
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

  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: "Convex admin key is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = await readJsonBody<SaveToConvexBody>(request, {
      maxBytes: MAX_SAVE_PAYLOAD_BYTES,
    });

    const articles = Array.isArray(body.articles) ? body.articles : [];
    const about = parseAboutPayload(body.about);
    const changelog = parseChangelogPayload(body.changelog);

    if (articles.length === 0 && !about) {
      return NextResponse.json({ error: "No Convex-compatible changes to save." }, { status: 400 });
    }

    const submittedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const client = getServerConvexClient();
    const savedItems: string[] = [];
    const warnings: string[] = [];

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
      savedItems,
      submittedBy,
      warnings,
      articleResult,
      entry,
    });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to save to Convex via Next route:", error);
    return NextResponse.json({ error: "Unable to save to Convex right now." }, { status: 500 });
  }
}
