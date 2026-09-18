/**
 * The `submittedBy` stamp a changelog row carries: the email's local part,
 * stripped to `[a-z0-9-]` and upper-cased, falling back to the display name
 * and then the whole email. `changelog.getBySubmitter` matches these keys
 * exactly, so the Next save route and the Postgres proposal apply must stamp
 * through the same function.
 */
export function deriveSubmittedBy(email: string, name?: string | null): string {
  const emailLocalPart = email.split("@")[0]?.trim() ?? "";
  const normalizedEmailKey = emailLocalPart.replace(/[^a-z0-9-]/gi, "").toUpperCase();

  if (normalizedEmailKey) {
    return normalizedEmailKey;
  }

  const normalizedName = name?.trim().replace(/[^a-z0-9-]/gi, "").toUpperCase() ?? "";
  return normalizedName || email.trim().toUpperCase();
}
