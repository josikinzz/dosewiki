import { formattingLocale, UI_LOCALES, type UiLocale } from "@/i18n/messages";

const DATE_FORMATTERS = Object.fromEntries(
  UI_LOCALES.map((locale) => [
    locale,
    new Intl.DateTimeFormat(formattingLocale(locale), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  ]),
) as Record<UiLocale, Intl.DateTimeFormat>;

export function formatArchiveDate(
  timestamp: string | null | undefined,
  locale: UiLocale = "en",
): string | null {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? null : DATE_FORMATTERS[locale].format(parsed);
}

export function isValidPublicationDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value.trim());
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
