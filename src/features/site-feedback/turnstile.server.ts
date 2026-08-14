import "server-only";

/**
 * Cloudflare Turnstile server-side verification for the public site feedback
 * form. Env-gated per the W6 contract: when TURNSTILE_SECRET_KEY is unset the
 * check is skipped entirely, so local/dev environments work without keys.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class TurnstileVerificationError extends Error {
  constructor(message = "Captcha verification failed.") {
    super(message);
    this.name = "TurnstileVerificationError";
  }
}

export async function verifyTurnstileToken(
  token: string | undefined,
  ip: string | undefined,
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return;
  }

  if (!token) {
    throw new TurnstileVerificationError();
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") {
    body.set("remoteip", ip);
  }

  let outcome: { success?: boolean };
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
    if (!response.ok) {
      throw new Error(`Turnstile siteverify returned ${response.status}.`);
    }
    outcome = (await response.json()) as { success?: boolean };
  } catch (error) {
    // Fail closed: an unreachable verifier must not disable the captcha.
    console.error("Turnstile siteverify request failed:", error);
    throw new TurnstileVerificationError();
  }

  if (outcome.success !== true) {
    throw new TurnstileVerificationError();
  }
}
