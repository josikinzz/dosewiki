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
