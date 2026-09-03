/**
 * The password acceptance rule, kept free of `node:crypto` so the reset and
 * invite forms can run it in the browser before a round trip. The server
 * routes run the same function again; the client check is a courtesy.
 */

export const MIN_PASSWORD_LENGTH = 12;

/** Returns a reason the password is unacceptable, or `null` when it is fine. */
export function validateNewPassword(plain: string): string | null {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (plain.trim().length !== plain.length) {
    return "Password must not start or end with whitespace.";
  }
  return null;
}
