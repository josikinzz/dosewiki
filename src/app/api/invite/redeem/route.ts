/**
 * POST /api/invite/redeem  { code, username, password, email?, name? }
 *
 * Public: the visitor has no session, the invite code is the whole
 * credential. Guessing a code is a credential-guessing attempt, so the route
 * shares the sign-in brake (`authCredentialAttempt`). The code and password
 * are hashed here; Postgres matches on the code hash and stores the password
 * hash, so neither plaintext is stored anywhere. On success the page signs
 * in with the same username and password through the credentials provider.
 */
import { NextResponse } from "next/server";
import { redeemInviteCode } from "@server/auth/memberships";
import { hashInviteCode, isWellFormedInviteCode, normalizeInviteCode } from "@server/auth/inviteCodes";
import { hashPassword, validateNewPassword } from "@server/auth/passwords";
import { normalizeUsername, validateUsername } from "@server/auth/usernamePolicy";
import { classifyDataRejection } from "@/lib/http/dataRejection";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Route-owned copy and status for each deliberate Postgres refusal. The route
 * never forwards Postgres prose to an anonymous visitor.
 */
const REFUSALS: Record<string, { status: number; message: string }> = {
  INVITE_UNKNOWN: { status: 404, message: "That invite code is not recognised. Check it for typos." },
  INVITE_REVOKED: { status: 410, message: "That invite code has been revoked. Ask the person who invited you for a new one." },
  INVITE_EXPIRED: { status: 410, message: "That invite code has expired. Ask the person who invited you for a new one." },
  INVITE_EXHAUSTED: { status: 410, message: "That invite code has already been used." },
  USERNAME_TAKEN: { status: 409, message: "That username is taken. Choose another." },
  EMAIL_TAKEN: { status: 409, message: "An account with that email already exists. Sign in instead, or leave the email blank." },
};

type RedeemBody = {
  code?: unknown;
  username?: unknown;
  password?: unknown;
  email?: unknown;
  name?: unknown;
};

const reject = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "authCredentialAttempt");
  if (limited) {
    return limited;
  }

  try {
    const body = await readJsonBody<RedeemBody>(request, { maxBytes: MAX_BODY_BYTES });

    const code = typeof body.code === "string" ? normalizeInviteCode(body.code) : "";
    if (!isWellFormedInviteCode(code)) {
      return reject("Enter the invite code exactly as it was given to you.");
    }

    const username = typeof body.username === "string" ? normalizeUsername(body.username) : "";
    const usernameProblem = validateUsername(username);
    if (usernameProblem) {
      return reject(usernameProblem);
    }

    const password = typeof body.password === "string" ? body.password : "";
    const passwordProblem = validateNewPassword(password);
    if (passwordProblem) {
      return reject(passwordProblem);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
      return reject("Enter a valid email address, or leave it blank.");
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length > MAX_NAME_LENGTH) {
      return reject(`Names are limited to ${MAX_NAME_LENGTH} characters.`);
    }

    const passwordHash = await hashPassword(password);
    await redeemInviteCode({
      codeHash: hashInviteCode(code),
      username,
      passwordHash,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
    });

    return NextResponse.json({ ok: true, username });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return reject(error.message, error.status);
    }

    const rejection = classifyDataRejection(error);
    const refusal = rejection ? REFUSALS[rejection.code] : undefined;
    if (refusal) {
      return NextResponse.json({ error: refusal.message, code: rejection!.code }, { status: refusal.status });
    }

    console.error("Failed to redeem an invite code via Next route:", error);
    return reject("Unable to create your account right now. Try again in a moment.", 500);
  }
}
