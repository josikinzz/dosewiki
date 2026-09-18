/**
 * Full English month names, pinned locally.
 *
 * `Intl.DateTimeFormat` would make the rendered label depend on the ambient
 * locale of whichever machine prerendered the index, so month names are a
 * constant here instead.
 */
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

/**
 * A trip date recovered from author-typed free text, at whatever precision the
 * source actually supports.
 *
 * The year is the only guaranteed component: a value only becomes a
 * `TripDateParts` at all once a year is recoverable. `month` and `day` are
 * present only when the source states them unambiguously, so a caller can
 * never mistake a fabricated component for a stated one.
 */
export interface TripDateParts {
  year: number;
  /** 1-12 when determinable, omitted when the corpus value is ambiguous or absent. */
  month?: number;
  /** 1-31 when determinable. */
  day?: number;
  /** True when the source hedged the value, e.g. a leading "~". */
  approximate: boolean;
}

/** Year first, then month, then day: `2020-03-15`, `2021/07/02`. */
const ISO_LIKE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

/** `October 4th 2020`, `February 17, 2013`, `Feb 27, 2021`, `May 5 2025`. */
const MONTH_DAY_YEAR = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/;

/** `12th of January 2017`, `23rd of October, 2020`. */
const DAY_OF_MONTH_YEAR = /^(\d{1,2})(?:st|nd|rd|th)?\s+of\s+([a-z]+)\.?,?\s+(\d{4})$/;

/** `April 2012`, `December 2016`. */
const MONTH_YEAR = /^([a-z]+)\.?,?\s+(\d{4})$/;

/** `Date.prototype.toString()` output: `Thu Mar 09 2023 04:00:01 GMT-0500`. */
const DATE_TO_STRING = /^[a-z]{3,}\s+([a-z]{3,})\s+(\d{1,2})\s+(\d{4})(?:\s|$)/;

/** Dotted day-first: `15. 8. 2021`. */
const DOTTED_DAY_FIRST = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?$/;

/** `09/2018`, `03/16`. */
const MONTH_SLASH_YEAR = /^(\d{1,2})\/(\d{2}|\d{4})$/;

/** `13/03/2018`, `09/30/2020`, `3/4/18`. */
const THREE_PART_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

/** Bare `2013`. */
const BARE_YEAR = /^(\d{4})$/;

/**
 * Resolve a full or three-letter English month name to its 1-12 index, or 0
 * when the token is not a month at all (`Sometime`, `Early`).
 */
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

/**
 * Widen a two-digit year to 2000 + YY, pass a four-digit year through.
 *
 * The corpus spans 2010 to 2026, so no 19xx value exists and no pivot year is
 * needed. A 19xx trip date would have to be written in full.
 */
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

/**
 * Parse a free-text trip date into its stated components.
 *
 * Patterns are matched explicitly, never by handing the string to `new Date`,
 * whose legacy fallback parser silently invents components for input it does
 * not recognise. Where a value is genuinely ambiguous, notably a slash date
 * whose first two components are both 1-12 and so could be either day-first or
 * month-first, the month and day are dropped rather than guessed: the result
 * degrades to the year it can prove. Returns `null` when no year is
 * recoverable.
 */
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

    // Exactly one component above 12 pins the ordering. Otherwise the value is
    // genuinely ambiguous between day-first and month-first conventions, both
    // of which the corpus uses, so only the year survives.
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

/**
 * Render the index-facing label for a free-text trip date.
 *
 * The label sits in a dense index row, so it stops at month-and-year precision
 * even when a day is known: dropping the day is what collapses well over a
 * hundred author-typed shapes onto one. Precision degrades rather than
 * guesses, from `March 2020` to `2018` to the trimmed source string when
 * nothing parses. Hedged values are prefixed with `around`. Returns `null`
 * only for a missing or blank value, which callers render as no date.
 */
export function formatTripDateLabel(
  raw: string | null | undefined,
  locale?: string,
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

  // English stays pinned to the constant month names so pre-rendered English
  // indexes keep their exact byte output; the mirror locale formats through
  // Intl, and server and hydration agree because the caller passes the same
  // locale both times.
  if (locale && locale !== "en") {
    const formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: parts.day === undefined ? "long" : "short",
      ...(parts.day === undefined ? {} : { day: "numeric" }),
    });
    const precise = formatter.format(
      new Date(Date.UTC(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1)),
    );
    return parts.approximate ? `约 ${precise}` : precise;
  }

  const precise =
    parts.month === undefined
      ? String(parts.year)
      : `${MONTH_NAMES[parts.month - 1]} ${parts.year}`;

  return parts.approximate ? `around ${precise}` : precise;
}

/**
 * Collapse a free-text trip date to a numeric key that sorts correctly.
 *
 * The key is `YYYYMMDD` with unknown components zeroed, so a month-precision
 * value sorts at the head of its month and a year-precision value at the head
 * of its year rather than being scattered through it. Hedging does not move a
 * value. Returns `null` when nothing parses, leaving the caller to place
 * unknown dates, conventionally last.
 */
export function tripDateSortValue(raw: string | null | undefined): number | null {
  const parts = parseTripDate(raw);

  if (!parts) {
    return null;
  }

  return parts.year * 10000 + (parts.month ?? 0) * 100 + (parts.day ?? 0);
}
