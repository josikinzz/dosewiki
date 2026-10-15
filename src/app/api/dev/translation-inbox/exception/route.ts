import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { recordQaException } from "@server/translation/reviewInboxFindings";
import type { InboxException, QaFindingKind } from "@server/translation/reviewInboxTypes";
import { glossaryLocaleAccess, parseLocale } from "../../translation-glossary/glossaryRoutes";
import { workbenchError } from "../../translation-workbench/workbenchRoutes";

export const runtime = "nodejs";

const FINDINGS: readonly QaFindingKind[] = ["glossary-disagreement", "leftover-latin"];

function text(raw: unknown, name: string, max: number): string {
  if (typeof raw !== "string" || !raw.trim() || raw.length > max) throw new JsonBodyError(400, `A ${name} is required.`);
  return raw;
}

export const POST = protectedRouteOperation<Record<string, unknown>, { locale: string; exception: InboxException }>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 8192,
    parse: (raw) => {
      if (!raw || typeof raw !== "object") throw new JsonBodyError(400, "Choose a finding to mark fine.");
      if (!FINDINGS.includes(raw.finding as QaFindingKind)) throw new JsonBodyError(400, "Only glossary and leftover-English findings can be marked fine.");
      const hash = text(raw.hash, "segment hash", 128);
      if (!/^[a-f0-9]+$/.test(hash)) throw new JsonBodyError(400, "A segment hash is required.");
      return {
        locale: parseLocale(raw.locale),
        exception: { finding: raw.finding as QaFindingKind, hash, term: text(raw.term, "term", 2000), revision: text(raw.revision, "revision", 200) },
      };
    },
  },
  mapError: workbenchError,
  unexpectedErrorLabel: "Recording an inbox exception failed",
  unexpectedErrorMessage: "Unable to record that exception right now.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    await recordQaException(body.locale, body.exception, actorEmail);
    return NextResponse.json({ ok: true, locale: body.locale, exception: body.exception });
  },
});
