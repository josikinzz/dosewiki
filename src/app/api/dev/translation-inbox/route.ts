/**
 * GET /api/dev/translation-inbox?locale=zh-Hans&offset=0
 *
 * Translator and up, for an assigned locale only. One page (50 items) of the
 * Review Inbox and its total. Read-only: each item's Accept calls an existing
 * workbench mutation with the revision this response shows.
 */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readReviewInbox } from "@server/translation/reviewInbox";
import { INBOX_PAGE_SIZE, type InboxResponse } from "@server/translation/reviewInboxTypes";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { workbenchError } from "../translation-workbench/workbenchRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseOffset(raw: string | null): number {
  if (raw === null || raw === "") return 0;
  const offset = Number(raw);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % INBOX_PAGE_SIZE !== 0)
    throw new JsonBodyError(400, `Choose an offset that is a multiple of ${INBOX_PAGE_SIZE}.`);
  return offset;
}

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  mapError: workbenchError,
  unexpectedErrorLabel: "Review inbox read failed",
  unexpectedErrorMessage: "Unable to read the review inbox right now.",
  operation: async ({ request, auth }) => {
    const params = new URL(request.url).searchParams;
    const locale = parseLocale(params.get("locale"));
    const offset = parseOffset(params.get("offset"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    getDataBackend();
    const inbox = await readReviewInbox(getPublicDataReadAdapter(), locale, offset);
    const body: InboxResponse = { ok: true, locale, offset, pageSize: INBOX_PAGE_SIZE, ...inbox };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  },
});
