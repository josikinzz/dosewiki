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
 * persisted under `PUBLIC_CONVEX_CACHE_TAGS.about`. Every save publishes the
 * `about` content identity through the shared publication seam, which expires
 * that cache here and delivers the same identity to the public deployments,
 * so `/about` shows the edit in seconds rather than at the end of the
 * public-data window.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { parseAboutBody, type AboutBody, type ParsedAbout } from "./parseAboutBody";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { parseCopyIndexPublicationInput, type CopyIndexPublicationInput } from "../copyIndexPublicationInput";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor", rateLimit: "diagnosticRead", capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load About editing source:", unexpectedErrorMessage: "The About editing source could not be loaded.",
  operation: async ({ actorEmail, convexWrite }) => NextResponse.json(await convexWrite!.client.query(api.siteConfig.getAboutForEditor, {
    apiKey: convexWrite!.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite!.adminKey, actorEmail,
  })),
});

export const POST = protectedRouteOperation<AboutBody & { expected?: unknown; expectedRevision?: unknown; operationId?: unknown }, ParsedAbout & { expected: unknown } & CopyIndexPublicationInput>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 1024 * 1024,
    parse: (raw) => {
      if (!Object.prototype.hasOwnProperty.call(raw, "expected")) throw new JsonBodyError(400, "A loaded About baseline is required.");
      return { ...parseAboutBody(raw), expected: raw.expected, ...parseCopyIndexPublicationInput(raw) };
    },
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

    const receipt = await convexWrite.client.mutation(api.siteConfig.saveAbout, {
      apiKey,
      actorEmail,
      aboutMarkdown: body.aboutMarkdown,
      aboutSubtitle: body.aboutSubtitle,
      founderProfileKeys: body.founderProfileKeys,
      updatedBy: actorEmail,
      expected: body.expected,
      expectedRevision: body.expectedRevision, operationId: body.operationId,
    });

    await publishPublicCache({ targets: [{ kind: "about" }], source: "manual" });

    return NextResponse.json({
      ok: true,
      revision: receipt.revision, replayed: receipt.replayed, unchanged: receipt.unchanged,
      about: {
        aboutMarkdown: body.aboutMarkdown,
        aboutSubtitle: body.aboutSubtitle,
        founderProfileKeys: body.founderProfileKeys,
        revision: receipt.revision,
      },
    });
  },
});
