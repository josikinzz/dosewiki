/**
 * Editor write endpoint for the About page document (the pinned About entry
 * of the /dev Writing tab).
 *
 *   POST /api/dev/about  { aboutMarkdown, aboutSubtitle, founderProfileKeys }
 *
 * Same shape as `/api/dev/writing-article`: the browser holds no admin intent
 * token, so the write is delegated here, which checks the editor session and
 * then calls `siteConfig.saveAbout` with the server's own token plus the
 * actor's email for the audit trail.
 *
 * The About page reads the document through `getPublicAboutData`, which is
 * persisted under `PUBLIC_CONVEX_CACHE_TAGS.about`; that tag is expired on
 * every save so `/about` shows the edit in seconds rather than at the end of
 * the public-data window.
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { normalizeFounderKeys } from "@/data/content/about";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const MARKDOWN_MAX_LENGTH = 400_000;
const SUBTITLE_MAX_LENGTH = 2_000;
const MAX_FOUNDER_KEYS = 48;
// The stable contributor key grammar (`convex/lib/contributorProfileImports`
// PROFILE_KEY) and the length ceiling `/api/dev/contributor-profile` applies.
const FOUNDER_KEY_PATTERN = /^[A-Z0-9-]+$/;
const FOUNDER_KEY_MAX_LENGTH = 200;

type AboutBody = {
  aboutMarkdown?: unknown;
  aboutSubtitle?: unknown;
  founderProfileKeys?: unknown;
};

type ParsedAbout = {
  aboutMarkdown: string;
  aboutSubtitle: string;
  founderProfileKeys: string[];
};

function requireText(raw: unknown, label: string, maxLength: number): string {
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string.`);
  }
  if (raw.length > maxLength) {
    throw new JsonBodyError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return raw;
}

function parseAboutBody(raw: AboutBody): ParsedAbout {
  const aboutMarkdown = requireText(raw.aboutMarkdown, "The page copy", MARKDOWN_MAX_LENGTH);
  const aboutSubtitle = requireText(raw.aboutSubtitle, "The subtitle", SUBTITLE_MAX_LENGTH);

  if (!Array.isArray(raw.founderProfileKeys)) {
    throw new JsonBodyError(400, "The founder keys must be an array.");
  }
  if (raw.founderProfileKeys.length > MAX_FOUNDER_KEYS) {
    throw new JsonBodyError(400, `The founder keys may hold at most ${MAX_FOUNDER_KEYS} entries.`);
  }
  if (raw.founderProfileKeys.some((entry) => typeof entry !== "string")) {
    throw new JsonBodyError(400, "Each founder key must be a string.");
  }

  const founderProfileKeys = normalizeFounderKeys(raw.founderProfileKeys);
  const invalidKey = founderProfileKeys.find(
    (key) => key.length > FOUNDER_KEY_MAX_LENGTH || !FOUNDER_KEY_PATTERN.test(key),
  );
  if (invalidKey !== undefined) {
    throw new JsonBodyError(
      400,
      "Each founder key must be a contributor profile key: letters, digits, and hyphens only.",
    );
  }

  return { aboutMarkdown, aboutSubtitle, founderProfileKeys };
}

export const POST = protectedRouteOperation<AboutBody, ParsedAbout>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 1024 * 1024,
    parse: parseAboutBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save the About page via Next route:",
  unexpectedErrorMessage: "Unable to save the About page right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    await convexWrite.client.mutation(api.siteConfig.saveAbout, {
      apiKey,
      actorEmail,
      aboutMarkdown: body.aboutMarkdown,
      aboutSubtitle: body.aboutSubtitle,
      founderProfileKeys: body.founderProfileKeys,
      updatedBy: actorEmail,
    });

    revalidatePath("/about");
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.about, { expire: 0 });

    return NextResponse.json({
      ok: true,
      about: {
        aboutMarkdown: body.aboutMarkdown,
        aboutSubtitle: body.aboutSubtitle,
        founderProfileKeys: body.founderProfileKeys,
      },
    });
  },
});
