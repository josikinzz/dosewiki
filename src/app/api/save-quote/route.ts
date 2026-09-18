import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { normalizeQuoteSectionId } from "../../../../lib/quoteSections.mjs";

export const runtime = "nodejs";

const MAX_QUOTE_PAYLOAD_BYTES = 2 * 1024 * 1024;

type SaveQuoteBody = {
  slug?: unknown;
  section?: unknown;
  content?: unknown;
};

function deriveSubmittedBy(email: string, name?: string | null): string {
  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();

  if (normalizedEmailKey) {
    return normalizedEmailKey;
  }

  const normalizedName = name?.trim().replace(/[^a-z0-9-]/gi, "").toUpperCase() ?? "";
  return normalizedName || email.trim().toUpperCase();
}

function parseBody(body: SaveQuoteBody): { slug: string; section: string; content: string } {
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const section = typeof body.section === "string" ? body.section.trim() : "";

  if (!slug) {
    throw new JsonBodyError(400, "Quote slug is required.");
  }

  if (!section) {
    throw new JsonBodyError(400, "Quote section is required.");
  }

  const normalizedSection = normalizeQuoteSectionId(section);
  if (!normalizedSection) {
    throw new JsonBodyError(400, `Unknown quote section: ${section}`);
  }

  if (typeof body.content !== "string") {
    throw new JsonBodyError(400, "Quote content must be a string.");
  }

  return {
    slug,
    section: normalizedSection,
    content: body.content,
  };
}

export const POST = protectedRouteOperation<SaveQuoteBody, { slug: string; section: string; content: string }>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_QUOTE_PAYLOAD_BYTES,
    parse: parseBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save quote via Next route:",
  unexpectedErrorMessage: "Unable to save quote right now.",
  mapError: (error) => {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return null;
  },
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const { slug, section, content } = body;
    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const apiKey = dataWrite.getAdminIntentToken?.("quoteMigrationWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.quotes.save, {
      apiKey,
      actorEmail,
      slug,
      section,
      content,
      updatedBy,
    });

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      id: result.id,
      updatedBy,
    });
  },
});
