import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getServerDataWriteCapability } from "@server/data/serverWriteCapability";
import { api } from "@server/postgres/runtime/api";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { INBOX_CHECKS, readReviewInbox } from "@server/translation/reviewInbox";
import type { ReaderSuggestionRow } from "@server/translation/reviewInboxFindings";
import { INBOX_PAGE_SIZE, type InboxReason, type InboxResponse } from "@server/translation/reviewInboxTypes";
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

function parseReason(raw: string | null): InboxReason | null {
  if (raw === null || raw === "") return null;
  if (!(INBOX_CHECKS as readonly string[]).includes(raw)) throw new JsonBodyError(400, "Choose a known inbox reason.");
  return raw as InboxReason;
}

async function readSuggestions(locale: string, actorEmail: string): Promise<ReaderSuggestionRow[] | null> {
  const result = getServerDataWriteCapability();
  if (!result.ok) return null;
  const capability = result.capability;
  const rows = await capability.client.query(api.glossaryFeedback.list, {
    apiKey: capability.getAdminIntentToken("editorArticleWrite") ?? capability.adminKey,
    actorEmail,
    locale,
  });
  return rows as unknown as ReaderSuggestionRow[];
}

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  mapError: workbenchError,
  unexpectedErrorLabel: "Review inbox read failed",
  unexpectedErrorMessage: "Unable to read the review inbox right now.",
  operation: async ({ request, auth, actorEmail }) => {
    const started = performance.now();
    const params = new URL(request.url).searchParams;
    const locale = parseLocale(params.get("locale"));
    const offset = parseOffset(params.get("offset"));
    const reason = parseReason(params.get("reason"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    getDataBackend();
    const suggestions = await readSuggestions(locale, actorEmail);
    const suggestionsRead = performance.now();
    const inbox = await readReviewInbox(getPublicDataReadAdapter(), locale, offset, { suggestions, reason });
    const inboxRead = performance.now();
    const body: InboxResponse = { ok: true, locale, offset, pageSize: INBOX_PAGE_SIZE, ...inbox };
    return NextResponse.json(body, { headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `suggestions;dur=${(suggestionsRead - started).toFixed(1)}, inbox;dur=${(inboxRead - suggestionsRead).toFixed(1)}`,
    } });
  },
});
