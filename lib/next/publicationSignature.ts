/**
 * Authentication for the cross-deployment publication signal.
 *
 * The public deployments must be able to trust a refresh request without
 * holding any editorial credential: a shared verification secret proves the
 * caller is this editor deployment, and grants nothing except cache expiry of
 * the identities in `publicCacheContract`. Effect Index keeps its
 * credential-free read-only Postgres role.
 *
 * The signature covers the exact bytes the receiver parses, so a body edited
 * in flight fails before the JSON is trusted.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Shared by editor and public projects. Absent means the feature is off. */
export const PUBLICATION_SECRET_ENV = "PUBLIC_CACHE_PUBLISH_SECRET";

/** Under this length a shared secret is a typo, not a key. */
const MIN_SECRET_LENGTH = 32;

export function getPublicationSecret(
  env: Partial<Record<string, string | undefined>> = process.env,
): string | null {
  const secret = env[PUBLICATION_SECRET_ENV]?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function signPublicationBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Constant-time compare; a length mismatch is rejected without comparing. */
export function verifyPublicationSignature(
  body: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signPublicationBody(body, secret), "utf8");
  const received = Buffer.from(signature.trim(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
