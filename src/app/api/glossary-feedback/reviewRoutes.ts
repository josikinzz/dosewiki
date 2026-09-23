import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getServerDataWriteCapabilityOrThrow } from "@server/data/serverWriteCapability";
import { api } from "@server/postgres/runtime/api";
import {
  glossaryAccessibleLocales,
  glossaryLocaleAccess,
  parseLocale,
} from "../dev/translation-glossary/glossaryRoutes";

export function glossaryReviewRead(kind: "feedback" | "reactions") {
  return protectedRouteOperation({
    auth: "translator",
    rateLimit: "editorPolledRead",
    unexpectedErrorLabel: "Glossary feedback review failed:",
    operation: async ({ request, auth, actorEmail }) => {
      const allowed = glossaryAccessibleLocales(auth);
      const locale = parseLocale(
        new URL(request.url).searchParams.get("locale") ?? allowed[0],
      );
      const denied = glossaryLocaleAccess(auth, locale);
      if (denied) return denied;
      const capability = getServerDataWriteCapabilityOrThrow();
      const args = {
        apiKey: capability.getAdminIntentToken("editorArticleWrite") ?? capability.adminKey,
        actorEmail,
        locale,
      };
      const data =
        kind === "feedback"
          ? await capability.client.query(api.glossaryFeedback.list, args)
          : await capability.client.query(api.glossaryFeedback.reactions, args);
      return NextResponse.json(
        { ok: true, locale, locales: allowed, [kind]: data },
        { headers: { "Cache-Control": "no-store" } },
      );
    },
  });
}
export const transitionGlossaryFeedback = protectedRouteOperation<
  Record<string, unknown>
>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "dataWrite" }],
  body: { maxBytes: 8192 },
  unexpectedErrorLabel: "Glossary feedback transition failed:",
  operation: async ({ request, body, actorEmail, dataWrite }) => {
    const id = new URL(request.url).pathname.split("/").slice(-2)[0];
    const status = body.status;
    if (
      !["new", "reviewing", "resolved", "rejected", "spam"].includes(
        String(status),
      ) ||
      (body.note !== undefined &&
        (typeof body.note !== "string" || body.note.length > 4000))
    )
      throw new JsonBodyError(400, "Invalid review decision.");
    const feedback = await dataWrite!.client.mutation(
      api.glossaryFeedback.transition,
      {
        apiKey: dataWrite!.getAdminIntentToken("editorArticleWrite") ?? dataWrite!.adminKey,
        actorEmail,
        id: id as import("@server/postgres/runtime/dataModel").Id<"glossaryFeedback">,
        status: status as
          "new" | "reviewing" | "resolved" | "rejected" | "spam",
        ...(typeof body.note === "string" ? { note: body.note } : {}),
      },
    );
    return NextResponse.json({ ok: true, feedback });
  },
});
