import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { parseReviewReason, type ReviewReason } from "@server/translation/reviewReason";
import { promoteCorrectionToStyleGuide, readStyleGuidePacket, writeStyleGuide } from "@server/translation/styleGuide";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { workbenchError } from "../translation-workbench/workbenchRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

type StyleGuideRequest =
  | { locale: string; action: "save" | "approve" | "restore"; expectedRevision: number; guide?: unknown; reason: ReviewReason; restoreRevision?: number }
  | { locale: string; action: "promote"; slug: string; segment: string; revision: number; why?: string };

function parse(raw: Record<string, unknown>): StyleGuideRequest {
  const locale = parseLocale(raw.locale);
  if (raw.action === "promote") {
    const correction = (raw.correction ?? {}) as Record<string, unknown>;
    if (correction.kind !== "article" || typeof correction.slug !== "string" || !correction.slug.trim() || correction.slug.length > 300
      || typeof correction.segment !== "string" || !correction.segment.trim() || correction.segment.length > 300
      || !Number.isSafeInteger(correction.revision) || Number(correction.revision) < 1)
      throw new JsonBodyError(400, "Choose a saved correction in an article to promote.");
    if (raw.why !== undefined && (typeof raw.why !== "string" || raw.why.length > 500)) throw new JsonBodyError(400, "Explain the example in up to 500 characters.");
    return { locale, action: "promote", slug: correction.slug, segment: correction.segment, revision: Number(correction.revision), why: raw.why as string | undefined };
  }
  if (!["save", "approve", "restore"].includes(String(raw.action)) || !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0)
    throw new JsonBodyError(400, "Choose an action and expected revision.");
  const reason = parseReviewReason(raw.reason);
  if (!reason) throw new JsonBodyError(400, "Explain this change in up to 1000 characters.");
  if (raw.action === "save" && (!raw.guide || typeof raw.guide !== "object")) throw new JsonBodyError(400, "Send the whole style guide to save.");
  if (raw.action === "restore" && (!Number.isSafeInteger(raw.restoreRevision) || Number(raw.restoreRevision) < 0))
    throw new JsonBodyError(400, "Choose a revision to restore.");
  return {
    locale,
    action: raw.action as "save" | "approve" | "restore",
    expectedRevision: Number(raw.expectedRevision),
    guide: raw.guide,
    reason,
    restoreRevision: raw.restoreRevision as number | undefined,
  };
}

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  mapError: workbenchError,
  unexpectedErrorLabel: "Style guide read failed",
  unexpectedErrorMessage: "Unable to read the style guide.",
  operation: async ({ request, auth }) => {
    const params = new URL(request.url).searchParams;
    const locale = parseLocale(params.get("locale"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    getDataBackend();
    const packet = await readStyleGuidePacket(locale, { history: params.get("history") === "1" });
    return NextResponse.json(packet, { headers: { "Cache-Control": "private, no-store" } });
  },
});

export const POST = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 512 * 1024, parse },
  mapError: workbenchError,
  unexpectedErrorLabel: "Style guide mutation failed",
  unexpectedErrorMessage: "Unable to save the style guide.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    const entry = body.action === "promote"
      ? await promoteCorrectionToStyleGuide(getPublicDataReadAdapter(), { ...body, actor: actorEmail })
      : await writeStyleGuide({ ...body, actor: actorEmail });
    return NextResponse.json({ ok: true, entry, packet: await readStyleGuidePacket(body.locale) });
  },
});
