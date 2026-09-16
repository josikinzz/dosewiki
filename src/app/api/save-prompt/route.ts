import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { isKnownPromptKey } from "@/data/config/promptRegistry";

export const runtime = "nodejs";

const MAX_PROMPT_PAYLOAD_BYTES = 512 * 1024;

type SavePromptBody = {
  key?: unknown;
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

function parseBody(body: SavePromptBody): { key: string; content: string } {
  const key = typeof body.key === "string" ? body.key.trim() : "";

  if (!key) {
    throw new JsonBodyError(400, "Prompt key is required.");
  }

  if (!isKnownPromptKey(key)) {
    throw new JsonBodyError(400, `Unknown prompt key: ${key}`);
  }

  if (typeof body.content !== "string") {
    throw new JsonBodyError(400, "Prompt content must be a string.");
  }

  return {
    key,
    content: body.content,
  };
}

export const POST = protectedRouteOperation<SavePromptBody, { key: string; content: string }>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_PROMPT_PAYLOAD_BYTES,
    parse: parseBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save prompt via Next route:",
  unexpectedErrorMessage: "Unable to save prompt right now.",
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

    const { key, content } = body;
    const updatedBy = deriveSubmittedBy(auth.session.user.email, auth.session.user.name);
    const apiKey = dataWrite.getAdminIntentToken?.("promptMigrationWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.prompts.save, {
      apiKey,
      actorEmail,
      key,
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
