export const MIN_PASSWORD_LENGTH = 12;

export function validateNewPassword(plain: string): string | null {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (plain.trim().length !== plain.length) {
    return "Password must not start or end with whitespace.";
  }
  return null;
}
