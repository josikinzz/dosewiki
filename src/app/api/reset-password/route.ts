import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { consumePasswordReset } from "@server/auth/memberships";
import { hashPassword, validateNewPassword } from "@server/auth/passwords";
import { dataRejectionResponse } from "@/lib/http/dataRejection";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4 * 1024;
const TOKEN_HEX_PATTERN = /^[0-9a-f]{64}$/;

type ResetBody = { token?: unknown; password?: unknown };

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "authCredentialAttempt");
  if (limited) {
    return limited;
  }

  try {
    const body = await readJsonBody<ResetBody>(request, { maxBytes: MAX_BODY_BYTES });

    const token = typeof body.token === "string" ? body.token.trim().toLowerCase() : "";
    if (!TOKEN_HEX_PATTERN.test(token)) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Ask an admin for a new one." },
        { status: 400 },
      );
    }

    const password = typeof body.password === "string" ? body.password : "";
    const passwordProblem = validateNewPassword(password);
    if (passwordProblem) {
      return NextResponse.json({ error: passwordProblem }, { status: 400 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const passwordHash = await hashPassword(password);
    await consumePasswordReset(tokenHash, passwordHash);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const rejection = dataRejectionResponse(error);
    if (rejection) {
      return rejection;
    }

    console.error("Failed to reset a password via Next route:", error);
    return NextResponse.json({ error: "Unable to reset your password right now." }, { status: 500 });
  }
}
