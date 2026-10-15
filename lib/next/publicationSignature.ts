import { createHmac, timingSafeEqual } from "node:crypto";

export const PUBLICATION_SECRET_ENV = "PUBLIC_CACHE_PUBLISH_SECRET";

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
