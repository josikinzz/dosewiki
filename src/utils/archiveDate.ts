const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Format an archived Effect Index timestamp — a post's instant, an article's
 * publication date — as a human date, e.g. `30 January 2019`.
 *
 * Pinned to `en-GB`/UTC rather than the ambient locale so a prerendered label
 * does not depend on the build machine, and so a date cannot drift across a
 * timezone boundary between builds. Returns `null` for a missing or
 * unparseable value, which callers render as no date rather than as "Invalid
 * Date".
 */
export function formatArchiveDate(timestamp: string | null | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? null : DATE_FORMATTER.format(parsed);
}

/**
 * Whether a stored publication date is one the public pages can show: a
 * calendar day (`YYYY-MM-DD`) that exists, or a full ISO timestamp starting
 * with one. A day like `2026-02-30` fails, because `Date` would quietly roll
 * it into March.
 */
export function isValidPublicationDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value.trim());
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
