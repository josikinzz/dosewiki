/**
 * Pure helpers behind the Change log tab: what a save says in editor words,
 * how saves group by day, what the loaded window of server history amounts to,
 * and which quick date range the filters currently match.
 */

import { describeChange, fieldWords } from "@/data/changelog/articleRecentChanges";
import type { ChangeLogArticleSummary, ChangeLogEntry } from "@/data/changelog/changeLog";

import { CHANGELOG_FEED_MAX_ROWS, type ChangelogFeedWindow } from "./useDevChangelogFeed";

export type EntrySummary = {
  /** `prose` inline edit, `source` reference added or removed, `bulk` a Dev editor save. */
  kind: "prose" | "source" | "bulk";
  /** What the save did, in editor words: "Reworded 3 words", "Updated 2 articles". */
  headline: string;
  /** Where it happened, as section and field words; null for whole-article saves. */
  location: string | null;
  /** A hand-written save note or the reference a source edit named. */
  detail: string | null;
  linesAdded: number;
  linesRemoved: number;
};

/**
 * One line the editor can read without opening the diff. The description
 * comes from the same projection the public article ledger uses, so the raw
 * field path never reaches the screen; the counts come from the stored diff
 * lines.
 */
export function summarizeEntry(entry: ChangeLogEntry): EntrySummary {
  const description = describeChange(entry.commit?.message ?? "", entry.markdown);
  const articleCount = entry.articles.length;
  const headline =
    description.kind === "bulk" && articleCount > 1
      ? `Updated ${articleCount} articles`
      : description.message;
  const location =
    [description.section?.label, description.field ? fieldWords(description.field) : null]
      .filter(Boolean)
      .join(" › ") || null;

  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of entry.markdown.split("\n")) {
    if (line.startsWith("+")) linesAdded += 1;
    else if (line.startsWith("-")) linesRemoved += 1;
  }

  return { kind: description.kind, headline, location, detail: description.detail, linesAdded, linesRemoved };
}

/** A plural noun for a count: `countNoun(1, "save")` is "1 save". */
export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "Caffeine", "Caffeine and Nicotine", "Caffeine, Nicotine, Alcohol and 11 more". */
export function articleNames(articles: readonly ChangeLogArticleSummary[], named = 3): string {
  const titles = articles.map((article) => article.title);
  if (titles.length <= 1) return titles[0] ?? "";
  if (titles.length <= named) return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  return `${titles.slice(0, named).join(", ")} and ${titles.length - named} more`;
}

const DAY_MS = 86_400_000;

function startOfLocalDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export type ChangeLogDay<T> = {
  /** Local calendar day, `YYYY-MM-DD`; stable key and `dateTime`. */
  key: string;
  /** "Today", "Yesterday", "Tuesday, Jan 13", with the year when it is not this one. */
  label: string;
  /** The day written out in full, for the heading's title. */
  full: string;
  items: T[];
};

/** A local calendar day as `YYYY-MM-DD`, the value a date input takes. */
export function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The heading a day of saves sits under, relative to `now`. */
export function dayLabel(time: number, now: number = Date.now()): { label: string; full: string } {
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(time)) / DAY_MS);
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const full = date.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (days === 0) return { label: "Today", full };
  if (days === 1) return { label: "Yesterday", full };
  return {
    label: date.toLocaleDateString("en", {
      weekday: "long",
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    }),
    full,
  };
}

/**
 * Saves grouped under the local day they landed on, keeping the feed's
 * newest-first order. Entry times render in local time, so the day cut is
 * local too (the date filters cut the same way).
 */
export function groupByDay<T>(
  items: readonly T[],
  getTime: (item: T) => string,
  now: number = Date.now(),
): ChangeLogDay<T>[] {
  const days: ChangeLogDay<T>[] = [];
  for (const item of items) {
    const time = Date.parse(getTime(item));
    const key = Number.isNaN(time) ? "unknown" : toLocalDateInputValue(new Date(time));
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    const words = Number.isNaN(time) ? { label: "Unknown date", full: "Unknown date" } : dayLabel(time, now);
    days.push({ key, ...words, items: [item] });
  }
  return days;
}

/** The time of day a save landed, in the reader's locale ("4:00 AM"). */
export function formatSaveTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The whole moment, for a `<time>` title: "Wednesday, January 14, 2026 at 1:00 PM". */
export function formatSaveMoment(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/** The quick ranges the date filter offers, in days back from today; `null` is any date. */
export const QUICK_DATE_RANGES = [7, 30] as const;

/** The start and end dates of a quick range that ends today. */
export function quickDateRange(days: number, now: Date = new Date()): { startDate: string; endDate: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: toLocalDateInputValue(start), endDate: toLocalDateInputValue(now) };
}

export type DatePreset = "any" | "7" | "30" | "custom";

/** Which date choice the current filter dates amount to. */
export function datePresetFor(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date(),
): DatePreset {
  if (!startDate && !endDate) return "any";
  for (const days of QUICK_DATE_RANGES) {
    const range = quickDateRange(days, now);
    if (range.startDate === startDate && range.endDate === endDate) return String(days) as DatePreset;
  }
  return "custom";
}

/** A date filter value (`YYYY-MM-DD`) in words: "Jan 9" or "Jan 9, 2025". */
export function formatFilterDate(value: string, now: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The date filter as one phrase for its removable chip. */
export function describeDateFilter(startDate: string | null, endDate: string | null, now: Date = new Date()): string | null {
  const preset = datePresetFor(startDate, endDate, now);
  if (preset === "any") return null;
  if (preset !== "custom") return `Past ${preset} days`;
  if (startDate && endDate) return `${formatFilterDate(startDate, now)} to ${formatFilterDate(endDate, now)}`;
  if (startDate) return `From ${formatFilterDate(startDate, now)}`;
  return `Until ${formatFilterDate(endDate ?? "", now)}`;
}

export type FeedWindowState = {
  /** The short, live status: "30 saves", "Latest 100 saves", "Loading saves". */
  status: string;
  loading: boolean;
  /** What the loaded window leaves out, when it leaves something out. */
  note: string | null;
};

/**
 * How much of the server history the tab holds, said plainly so a capped
 * feed is never presented as the whole record.
 */
export function describeWindow(feedWindow: ChangelogFeedWindow, totalEntriesCount: number): FeedWindowState {
  if (feedWindow.loading && feedWindow.loadedCount === 0) {
    return { status: "Loading saves", loading: true, note: null };
  }
  if (feedWindow.loading) {
    return {
      status: "Loading older saves",
      loading: true,
      note: `The latest ${feedWindow.loadedCount} saves are loaded so far.`,
    };
  }
  if (feedWindow.atServerCap) {
    return {
      status: `Latest ${feedWindow.loadedCount} saves`,
      loading: false,
      note: `Only the latest ${CHANGELOG_FEED_MAX_ROWS} saves can be loaded here; older saves do not appear in this list or its filters.`,
    };
  }
  if (feedWindow.hasMore) {
    return {
      status: `Latest ${feedWindow.loadedCount} saves`,
      loading: false,
      note: `Only the latest ${feedWindow.loadedCount} saves are loaded; older saves load from the end of the list.`,
    };
  }
  return { status: countNoun(totalEntriesCount, "save"), loading: false, note: null };
}
