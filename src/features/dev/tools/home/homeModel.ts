import { canApprove, roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import type { DevRailBadge, DevRailBadgeReading } from "@/features/dev/pages/useDevRailBadges";
import { devHref } from "@/utils/devHref";
import { readerSuggestionsHref } from "@server/translation/reviewInboxTypes";

export type HomeCardSet = "admin" | "editor" | "translator" | "contributor";

export function homeCardSetsFor(role: AppRole | null): HomeCardSet[] {
  if (canApprove(role)) return ["admin", "editor"];
  const sets: HomeCardSet[] = [];
  if (roleMeetsFloor(role, "editor")) sets.push("editor");
  if (roleMeetsFloor(role, "translator")) sets.push("translator");
  if (sets.length === 0 && roleMeetsFloor(role, "contributor")) sets.push("contributor");
  return sets;
}

export function homeSummaryFor(sets: readonly HomeCardSet[]): string {
  const parts: string[] = [];
  if (sets.includes("admin")) parts.push("the queues waiting on admins", "open invites");
  if (sets.includes("editor")) parts.push("your drafts and proposals");
  if (sets.includes("translator")) parts.push("the review inbox for each of your languages");
  if (sets.includes("contributor")) parts.push("your profile and trip reports");
  if (parts.length === 0) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `${list[0].toUpperCase()}${list.slice(1)}. Each row opens the tool that owns it.`;
}

export type HomeCount =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "known"; count: number; stale: boolean };

export function readHomeCount(reading: DevRailBadgeReading, part?: string): HomeCount {
  if (reading.count === null) return reading.failed ? { kind: "unknown" } : { kind: "loading" };
  const count = part === undefined ? reading.count : reading.parts?.[part];
  if (count === undefined) return { kind: "unknown" };
  return { kind: "known", count, stale: reading.failed };
}

export type HomeTotal = HomeCount | { kind: "at-least"; count: number };

export function sumHomeCounts(counts: readonly HomeCount[]): HomeTotal {
  if (counts.some((count) => count.kind === "loading")) return { kind: "loading" };
  let sum = 0;
  let stale = false;
  for (const count of counts) {
    if (count.kind !== "known") continue;
    sum += count.count;
    stale ||= count.stale;
  }
  if (counts.some((count) => count.kind === "unknown")) {
    return sum > 0 ? { kind: "at-least", count: sum } : { kind: "unknown" };
  }
  return { kind: "known", count: sum, stale };
}

export type AdminWaitingRow = { label: string; badge: DevRailBadge; part?: string; href: string };

export const ADMIN_WAITING_ROWS: readonly AdminWaitingRow[] = [
  { label: "Trip reports", badge: "trip-reports", href: devHref({ type: "dev", tab: "trip-report-submissions" }) },
  {
    label: "Article feedback",
    badge: "feedback",
    part: "article",
    href: devHref({ type: "dev", tab: "article-feedback", filter: "article" }),
  },
  {
    label: "Site feedback",
    badge: "feedback",
    part: "site",
    href: devHref({ type: "dev", tab: "article-feedback", filter: "site" }),
  },
  { label: "Glossary feedback", badge: "glossary-feedback", href: readerSuggestionsHref() },
  { label: "Citations", badge: "citations", href: devHref({ type: "dev", tab: "citation-review" }) },
  { label: "Proposals", badge: "proposals", href: devHref({ type: "dev", tab: "queue" }) },
  { label: "Review recommendations", badge: "review-recommendations", href: devHref({ type: "dev", tab: "queue" }) },
];

export function glossaryInboxHref(locale?: string): string {
  const params = new URLSearchParams();
  if (locale) params.set("locale", locale);
  params.set("translationView", "inbox");
  return `${devHref({ type: "dev", tab: "glossary" })}?${params.toString()}`;
}

const DAY_MS = 86_400_000;

export type HomeDay = { relative: string; full: string; days: number };

export function describeDay(iso: string, now: number = Date.now()): HomeDay | null {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const startOf = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((startOf(time) - startOf(now)) / DAY_MS);
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const absolute = date.toLocaleDateString("en", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  const relative = Math.abs(days) <= 13
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day")
    : absolute;
  const full = date.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  return { relative, full, days };
}

export const INVITE_CLOSING_DAYS = 2;

export const HOME_LIST_CAP = 5;

export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
