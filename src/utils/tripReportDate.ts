import { formattingLocale, type Translate, type UiLocale } from "@/i18n/messages";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface TripDateParts {
  year: number;
  month?: number;
  day?: number;
  approximate: boolean;
}

const ISO_LIKE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

const MONTH_DAY_YEAR = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/;

const DAY_OF_MONTH_YEAR = /^(\d{1,2})(?:st|nd|rd|th)?\s+of\s+([a-z]+)\.?,?\s+(\d{4})$/;

const MONTH_YEAR = /^([a-z]+)\.?,?\s+(\d{4})$/;

const DATE_TO_STRING = /^[a-z]{3,}\s+([a-z]{3,})\s+(\d{1,2})\s+(\d{4})(?:\s|$)/;

const DOTTED_DAY_FIRST = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?$/;

const MONTH_SLASH_YEAR = /^(\d{1,2})\/(\d{2}|\d{4})$/;

const THREE_PART_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

const BARE_YEAR = /^(\d{4})$/;

function monthFromName(token: string): number {
  const needle = token.toLowerCase();

  for (let index = 0; index < MONTH_NAMES.length; index += 1) {
    const name = MONTH_NAMES[index].toLowerCase();

    if (needle === name || needle === name.slice(0, 3)) {
      return index + 1;
    }
  }

  return 0;
}

function normalizeYear(token: string): number {
  const value = Number(token);

  return token.length === 2 ? 2000 + value : value;
}

function isMonth(value: number): boolean {
  return value >= 1 && value <= 12;
}

function isDay(value: number): boolean {
  return value >= 1 && value <= 31;
}

export function parseTripDate(raw: string | null | undefined): TripDateParts | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const approximate = trimmed.startsWith("~");
  const value = approximate ? trimmed.slice(1).trim() : trimmed;
  const lowered = value.toLowerCase();

  const isoLike = ISO_LIKE.exec(value);

  if (isoLike) {
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);

    if (isMonth(month) && isDay(day)) {
      return { year: Number(isoLike[1]), month, day, approximate };
    }
  }

  const monthDayYear = MONTH_DAY_YEAR.exec(lowered);

  if (monthDayYear) {
    const month = monthFromName(monthDayYear[1]);
    const day = Number(monthDayYear[2]);

    if (month > 0 && isDay(day)) {
      return { year: Number(monthDayYear[3]), month, day, approximate };
    }
  }

  const dayOfMonthYear = DAY_OF_MONTH_YEAR.exec(lowered);

  if (dayOfMonthYear) {
    const month = monthFromName(dayOfMonthYear[2]);
    const day = Number(dayOfMonthYear[1]);

    if (month > 0 && isDay(day)) {
      return { year: Number(dayOfMonthYear[3]), month, day, approximate };
    }
  }

  const monthYear = MONTH_YEAR.exec(lowered);

  if (monthYear) {
    const month = monthFromName(monthYear[1]);

    if (month > 0) {
      return { year: Number(monthYear[2]), month, approximate };
    }
  }

  const dateToString = DATE_TO_STRING.exec(lowered);

  if (dateToString) {
    const month = monthFromName(dateToString[1]);
    const day = Number(dateToString[2]);

    if (month > 0 && isDay(day)) {
      return { year: Number(dateToString[3]), month, day, approximate };
    }
  }

  const dotted = DOTTED_DAY_FIRST.exec(value);

  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);

    if (isMonth(month) && isDay(day)) {
      return { year: Number(dotted[3]), month, day, approximate };
    }
  }

  const monthSlashYear = MONTH_SLASH_YEAR.exec(value);

  if (monthSlashYear) {
    const month = Number(monthSlashYear[1]);

    if (isMonth(month)) {
      return { year: normalizeYear(monthSlashYear[2]), month, approximate };
    }
  }

  const threePartSlash = THREE_PART_SLASH.exec(value);

  if (threePartSlash) {
    const first = Number(threePartSlash[1]);
    const second = Number(threePartSlash[2]);
    const year = normalizeYear(threePartSlash[3]);

    if (first > 12 && isMonth(second) && isDay(first)) {
      return { year, month: second, day: first, approximate };
    }

    if (second > 12 && isMonth(first) && isDay(second)) {
      return { year, month: first, day: second, approximate };
    }

    return { year, approximate };
  }

  const bareYear = BARE_YEAR.exec(value);

  if (bareYear) {
    return { year: Number(bareYear[1]), approximate };
  }

  return null;
}

export function formatTripDateLabel(
  raw: string | null | undefined,
  locale: UiLocale,
  t: Translate,
): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parts = parseTripDate(trimmed);

  if (!parts) {
    return trimmed;
  }

  const precise = locale === "en" ? englishTripDateLabel(parts) : localizedTripDateLabel(parts, locale);

  return parts.approximate ? t("tripReport.approximateDate", { date: precise }) : precise;
}

function englishTripDateLabel(parts: TripDateParts): string {
  return parts.month === undefined
    ? String(parts.year)
    : `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;
}

function localizedTripDateLabel(parts: TripDateParts, locale: UiLocale): string {
  const formatter = new Intl.DateTimeFormat(formattingLocale(locale), {
    timeZone: "UTC",
    year: "numeric",
    month: parts.month === undefined ? undefined : parts.day === undefined ? "long" : "short",
    day: parts.day === undefined ? undefined : "numeric",
  });

  return formatter.format(new Date(Date.UTC(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1)));
}

export function tripDateSortValue(raw: string | null | undefined): number | null {
  const parts = parseTripDate(raw);

  if (!parts) {
    return null;
  }

  return parts.year * 10000 + (parts.month ?? 0) * 100 + (parts.day ?? 0);
}
