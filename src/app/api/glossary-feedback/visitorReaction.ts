import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getSiteFeedbackIpHashSecret } from "@/features/site-feedback/siteFeedbackStore.server";
import { glossaryLanguage } from "@/features/language-glossary/languageGlossary";
export const COOKIE = "glossary-visitor";
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, "publicContentApiRead");
  if (limited) return limited;
  const cookie = request.cookies.get(COOKIE)?.value ?? "";
  const locale = request.nextUrl.searchParams.get("locale");
  const term = request.nextUrl.searchParams.get("term");
  const version = request.nextUrl.searchParams.get("version");
  let choice: "right" | "improve" | "clear" = "clear";
  if (locale !== null || term !== null || version !== null) {
    if (
      !glossaryLanguage(locale ?? "") ||
      !term ||
      term.length > 200 ||
      !version ||
      version.length > 3000
    )
      return NextResponse.json(
        { error: "Invalid glossary identity." },
        { status: 400 },
      );
    const secret = getSiteFeedbackIpHashSecret();
    if (!secret)
      return NextResponse.json(
        { error: "Feedback is temporarily unavailable." },
        { status: 503 },
      );
    if (UUID.test(cookie)) {
      try {
        const [row] = await getPostgresClient().sql<{
          choice: "right" | "improve" | "clear";
        }>(
          'SELECT "choice" FROM "glossaryReactionEvents" WHERE "locale" = $1 AND "term" = $2 AND "version" = $3 AND "visitor" = $4 ORDER BY "created_at" DESC LIMIT 1',
          [
            locale,
            term,
            version,
            createHmac("sha256", secret).update(cookie).digest("hex"),
          ],
        );
        choice = row?.choice ?? "clear";
      } catch {
        return NextResponse.json(
          { error: "Unable to load your reaction. Please retry." },
          { status: 503 },
        );
      }
    }
  }
  const response = NextResponse.json(
    { ok: true, choice },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  if (!UUID.test(cookie))
    response.cookies.set(COOKIE, randomUUID(), {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "strict",
      path: "/api/glossary-feedback",
      maxAge: 365 * 86400,
    });
  return response;
}
