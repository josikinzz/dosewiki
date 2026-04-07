import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { readJsonBody, JsonBodyError } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteClient } from "@server/convex/serverClient";
import { getServerConvexAdminKey } from "@server/convex/serverWriteHealth";

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

  if (typeof body.content !== "string") {
    throw new JsonBodyError(400, "Quote content must be a string.");
  }

  return {
    slug,
    section,
    content: body.content,
  };
}

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, { windowMs: 60_000, max: 20 });
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const adminKey = getServerConvexAdminKey();
  if (!adminKey) {
    return NextResponse.json(
      { error: "Convex admin key is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const body = await readJsonBody<SaveQuoteBody>(request, {
      maxBytes: MAX_QUOTE_PAYLOAD_BYTES,
    });
    const { slug, section, content } = parseBody(body);
    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);

    const result = await getServerConvexWriteClient().mutation(api.quotes.save, {
      apiKey: adminKey,
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
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to save quote via Next route:", error);
    return NextResponse.json({ error: "Unable to save quote right now." }, { status: 500 });
  }
}
