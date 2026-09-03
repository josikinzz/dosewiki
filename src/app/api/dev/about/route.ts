/**
 * Admin write endpoint for the About page document (the pinned About entry
 * of the /dev Writing tab).
 *
 *   POST /api/dev/about  { aboutMarkdown, aboutSubtitle, founderProfileKeys }
 *
 * Admin only: an editor's About save goes through `POST /api/dev/proposals`
 * as an `about` proposal instead, and reaches `siteConfig.saveAbout` only
 * when an admin approves it. The browser holds no admin intent token, so the
 * write is delegated here, which checks the admin session and then calls
 * `siteConfig.saveAbout` with the server's own token plus the actor's email
 * for the audit trail.
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
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { parseAboutBody, type AboutBody, type ParsedAbout } from "./parseAboutBody";

export const runtime = "nodejs";

export const POST = protectedRouteOperation<AboutBody, ParsedAbout>({
  auth: "admin",
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
