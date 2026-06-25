import { NextResponse } from "next/server";
import { saveSubstanceIndexWithGitHub } from "@server/server/github/saveSubstanceIndex.mjs";
import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { readJsonBody, JsonBodyError } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const MAX_ARTICLES_PAYLOAD_BYTES = 20 * 1024 * 1024;

function deriveSubmittedBy(body: Record<string, unknown>, email: string): string {
  const rawUsername = typeof body.username === "string" ? body.username.trim() : "";
  if (rawUsername) {
    return rawUsername.toUpperCase();
  }

  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();

  return normalizedEmailKey || email.trim().toUpperCase();
}

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "editorHeavyWrite");
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: "Required environment variables are missing." }, { status: 500 });
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, {
      maxBytes: MAX_ARTICLES_PAYLOAD_BYTES,
    });

    const result = await saveSubstanceIndexWithGitHub({
      body,
      submittedBy: deriveSubmittedBy(body, auth.session.user.email),
      githubToken,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to save substance index via Next route:", error);
    return NextResponse.json({ error: "Unable to save articles right now." }, { status: 500 });
  }
}
