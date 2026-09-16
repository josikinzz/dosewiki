/**
 * POST /api/reset-password  { token, password }
 *
 * Public: the person resetting has no session, so the token from the link an
 * admin issued (`/api/dev/members/reset`) is the whole credential. Guessing a
 * token is a password-guessing attempt, so the route shares the sign-in
 * brake (`authCredentialAttempt`). The token is hashed here and Postgres
 * matches on the hash, so the plaintext is never stored anywhere.
 */
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

    // An unknown or expired token is a deliberate Postgres rejection with a
    // sentence meant for the reader; everything else is an outage.
    const rejection = dataRejectionResponse(error);
    if (rejection) {
      return rejection;
    }

    console.error("Failed to reset a password via Next route:", error);
    return NextResponse.json({ error: "Unable to reset your password right now." }, { status: 500 });
  }
}
