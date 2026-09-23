import { COOKIE, UUID } from "./visitorReaction";
import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { getPublicIntakeWriteCapability } from "@server/data/serverWriteCapability";
import { isDataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { enforceRateLimit, getClientIp } from "@server/http/nextRateLimit";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { dataRejectionResponse } from "@/lib/http/dataRejection";
import { getSiteFeedbackIpHashSecret } from "@/features/site-feedback/siteFeedbackStore.server";
import {
  TurnstileVerificationError,
  verifyTurnstileToken,
} from "@/features/site-feedback/turnstile.server";
import { glossaryLanguage } from "@/features/language-glossary/languageGlossary";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    (request.headers.get("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  )
    return NextResponse.json(
      { error: "Send feedback from this site." },
      { status: 403 },
    );
  const limited = await enforceRateLimit(request, "publicSiteFeedbackSubmit");
  if (limited) return limited;
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, {
      maxBytes: 16 * 1024,
    });
    const text = (key: string, max: number, required = false) => {
      const value = body[key];
      if (
        (value !== undefined && typeof value !== "string") ||
        (typeof value === "string" && value.length > max) ||
        (required && (typeof value !== "string" || !value.trim()))
      )
        throw new JsonBodyError(400, `Invalid ${key}.`);
      return typeof value === "string" ? value : "";
    };
    const locale = text("locale", 20, true);
    if (!glossaryLanguage(locale))
      throw new JsonBodyError(400, "Unknown language.");
    const id = text("id", 36, true);
    if (!UUID.test(id))
      throw new JsonBodyError(400, "Invalid submission identity.");
    const cookie = request.cookies.get(COOKIE)?.value;
    if (!cookie || !UUID.test(cookie))
      throw new JsonBodyError(400, "Enable cookies and retry your feedback.");
    const secret = getSiteFeedbackIpHashSecret();
    const capability = getPublicIntakeWriteCapability();
    if (!secret || !capability)
      return NextResponse.json(
        { error: "Feedback is temporarily unavailable." },
        { status: 503 },
      );
    const common = {
      apiKey: capability.apiKey,
      id,
      locale,
      term: text("term", 200, true),
      version: text("version", 3000, true),
      visitor: createHmac("sha256", secret).update(cookie).digest("hex"),
    };
    const honeypot = Boolean(text("website", 500));
    await verifyTurnstileToken(
      text("turnstileToken", 2048) || undefined,
      getClientIp(request),
    );
    if (body.action === "reaction") {
      const choice = body.choice;
      if (choice !== "right" && choice !== "improve" && choice !== "clear")
        throw new JsonBodyError(400, "Choose a reaction or clear your choice.");
      if (honeypot) return NextResponse.json({ ok: true }, { status: 202 });
      await capability.client.mutationAsService(
        api.glossaryFeedback.createReaction,
        { ...common, choice },
      );
    } else if (body.action === "suggestion") {
      const details = text("details", 4000).trim();
      const alternative = text("alternative", 400).trim();
      if (!details && !alternative)
        throw new JsonBodyError(
          400,
          "Add a comment or an alternative translation.",
        );
      await capability.client.mutationAsService(api.glossaryFeedback.create, {
        ...common,
        details,
        alternative,
        honeypot,
      });
    } else throw new JsonBodyError(400, "Unknown feedback action.");
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    if (error instanceof JsonBodyError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof TurnstileVerificationError)
      return NextResponse.json(
        { error: "Captcha verification failed. Please try again." },
        { status: 400 },
      );
    if (isDataWriteFrozenError(error))
      return NextResponse.json(
        { error: "Feedback is paused. Your draft has been kept." },
        { status: 503 },
      );
    const rejected = dataRejectionResponse(error);
    if (rejected) return rejected;
    console.error("Glossary feedback failed", error);
    return NextResponse.json(
      { error: "Unable to save feedback. Please retry." },
      { status: 500 },
    );
  }
}
