import {
  isVisualReplication,
  type GalleryReplication,
} from "@/types/replications";

/**
 * Pure view model for the Effect Index homepage panels.
 *
 * Everything here is deterministic on purpose. The original site shuffled its featured
 * article, reports and replications on every client render; this page is prerendered, so
 * the variety comes from a `seed` the server loader supplies once and the selection itself
 * stays a total function of (data, seed). That keeps the panels testable and keeps the
 * server and client agreeing on the order they render.
 *
 * None of these types are the Postgres read models. The loader narrows those down to exactly
 * what the panels display, so the homepage's client bundle never has to carry article
 * bodies or report timelines it does not render.
 */

/* ------------------------------------------------------------------ shared */

/**
 * Rotate a list by `seed` positions. Preferred over a shuffle: it varies the leading item
 * between builds the way the original's shuffle did, while staying verifiable in a test and
 * leaving the curator's ordering otherwise intact.
 */
export function rotateBySeed<T>(items: readonly T[], seed: number): T[] {
  if (items.length === 0) {
    return [];
  }

  const normalized = Math.abs(Math.trunc(seed)) % items.length;

  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

/* ---------------------------------------------------------- featured effects */

export interface HomeEffectInput {
  name: string;
  slug: string;
  featured?: boolean;
  tags: readonly string[];
}

interface HomeFeaturedEffect { name: string;
slug: string; }

export interface HomeFeaturedEffectGroup {
  id: string;
  /** Sub-group label rendered inside the panel: uppercase, tracked out, teal. */
  label: string;
  effects: HomeFeaturedEffect[];
}

/**
 * The three groupings the original panel used, in its order. Each is a plain tag match on
 * the effect record — the same `visual` / `cognitive` / `miscellaneous` tags the legacy
 * import carried across.
 */
const FEATURED_EFFECT_GROUP_DEFINITIONS = [
  { id: "visual", label: "Visual Effects", tag: "visual" },
  { id: "cognitive", label: "Cognitive Effects", tag: "cognitive" },
  { id: "miscellaneous", label: "Miscellaneous Effects", tag: "miscellaneous" },
] as const

export function selectFeaturedEffectGroups(
  effects: readonly HomeEffectInput[],
): HomeFeaturedEffectGroup[] {
  const featured = effects.filter((effect) => effect.featured === true);

  return FEATURED_EFFECT_GROUP_DEFINITIONS.flatMap(({ id, label, tag }) => {
    const matches = featured
      .filter((effect) => effect.tags.some((value) => value.trim().toLowerCase() === tag))
      .map(({ name, slug }) => ({ name, slug }));

    // A group with nothing in it prints a label above empty space, so it is dropped.
    return matches.length > 0 ? [{ id, label, effects: matches }] : [];
  });
}

/* --------------------------------------------------------- featured article */

export interface HomeArticleInput {
  slug: string;
  title: string;
  featured?: boolean;
  authors?: readonly string[];
  publicationDate?: string;
  shortDescription?: string;
  body_raw?: string;
  readMinutes?: number;
}

export interface HomeFeaturedArticle {
  slug: string;
  title: string;
  /** "Josie Kins" / "Josie Kins and Greg" / "A, B and C" — never prefixed with "by". */
  authorLine?: string;
  /** "Tuesday, April 20 2021", the format the original's `fecha` mask produced. */
  dateLabel?: string;
  readTimeLabel?: string;
  description?: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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
];

/**
 * "Tuesday, April 20 2021". Read in UTC deliberately: a date-only ISO string parses as UTC
 * midnight, so reading local parts would shift the day (and the weekday) for anyone west of
 * Greenwich, and would make the prerendered output depend on the build machine's timezone.
 */
export function formatFeaturedArticleDate(publicationDate: string | undefined): string | undefined {
  if (!publicationDate) {
    return undefined;
  }

  const parsed = new Date(publicationDate);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const weekday = WEEKDAY_NAMES[parsed.getUTCDay()];
  const month = MONTH_NAMES[parsed.getUTCMonth()];

  return `${weekday}, ${month} ${parsed.getUTCDate()} ${parsed.getUTCFullYear()}`;
}

/**
 * `effectIndexArticles.authors` came across from the legacy Mongo dump as raw 24-character
 * ObjectIds, and nothing in this codebase maps them back to a person: contributor lookup
 * works on free-text names. The original site rendered `author.full_name` from a populated
 * relation that no longer exists, so an unresolved id is dropped rather than printed —
 * "by 60542430198361300fea3610" is worse than no byline. Real names still render, so the
 * panel starts crediting authors again the moment that field is backfilled.
 */
function isDisplayableAuthorName(name: string): boolean {
  return !/^[0-9a-f]{24}$/i.test(name);
}

/** "A", "A and B", "A, B and C" — the original's join, including the Oxford-less "and". */
export function formatAuthorLine(authors: readonly string[] | undefined): string | undefined {
  const names = (authors ?? [])
    .map((author) => author.trim())
    .filter((author) => author.length > 0 && isDisplayableAuthorName(author));

  if (names.length === 0) {
    return undefined;
  }

  if (names.length === 1) {
    return names[0];
  }

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Exactly one article, chosen from the featured set. The panel's title is singular
 * ("Featured Article") because the original only ever rendered one.
 */
export function selectFeaturedArticle(
  articles: readonly HomeArticleInput[],
  seed: number,
  formatReadTime: (body: string | undefined) => string | undefined = () => undefined,
): HomeFeaturedArticle | null {
  const featured = rotateBySeed(
    articles.filter((article) => article.featured === true),
    seed,
  );

  const [article] = featured;

  if (!article) {
    return null;
  }

  const description = article.shortDescription?.trim();

  return {
    slug: article.slug,
    title: article.title,
    authorLine: formatAuthorLine(article.authors),
    dateLabel: formatFeaturedArticleDate(article.publicationDate),
    readTimeLabel: article.readMinutes ? `${article.readMinutes} min read` : formatReadTime(article.body_raw),
    description: description && description.length > 0 ? description : undefined,
  };
}

/* --------------------------------------------------------- featured reports */

export interface HomeReportSubstanceInput {
  name: string;
  dose?: string;
  roa?: string;
}

export interface HomeReportInput {
  slug: string;
  title: string;
  author: string;
  featured?: boolean;
  substances: readonly HomeReportSubstanceInput[];
}

export interface HomeFeaturedReport {
  slug: string;
  title: string;
  author: string;
  /** The single substance's name, "Combination" for more than one, or "" for none. */
  substanceName: string;
  /** "25mg Oral" — dose and route joined, empty when either is unknown or combined. */
  doseLine: string;
}

/** The original's rule: one substance shows its dose and route, several collapse to a label. */
export function summarizeReportSubstances(
  substances: readonly HomeReportSubstanceInput[],
): Pick<HomeFeaturedReport, "substanceName" | "doseLine"> {
  if (substances.length === 0) {
    return { substanceName: "", doseLine: "" };
  }

  if (substances.length > 1) {
    return { substanceName: "Combination", doseLine: "" };
  }

  const [substance] = substances;

  return {
    substanceName: substance.name,
    doseLine: [substance.dose, substance.roa]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" "),
  };
}

const FEATURED_REPORT_COUNT = 8

export function selectFeaturedReports(
  reports: readonly HomeReportInput[],
  seed: number,
  limit: number = FEATURED_REPORT_COUNT,
): HomeFeaturedReport[] {
  return rotateBySeed(
    reports.filter((report) => report.featured === true),
    seed,
  )
    .slice(0, Math.max(0, limit))
    .map((report) => ({
      slug: report.slug,
      title: report.title,
      author: report.author,
      ...summarizeReportSubstances(report.substances),
    }));
}

/* ---------------------------------------------------- featured replications */

export interface HomeFeaturedReplication {
  /** The full record, because the shared lightbox consumes it unchanged. */
  replication: GalleryReplication;
  /** "A replication of " or "A replication of an ". */
  introduction: string;
  effectSlug: string;
  effectName: string;
}

/**
 * "A replication of an Autonomous entity" vs "A replication of Geometry". The original
 * carried a hardcoded three-name exception list; every entry on it began with a vowel, so
 * the general rule reproduces it and also covers effects added since.
 */
export function buildReplicationIntroduction(effectName: string): string {
  return /^[aeiou]/i.test(effectName.trim())
    ? "A replication of an "
    : "A replication of ";
}

function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

/**
 * Resolve the curated slug list against the live replication read.
 *
 * "Featured" is editorial curation rather than derived data, so the list is checked in
 * (`data/effects/effectIndexFeaturedReplications.json`) rather than stored as a
 * `featured` field the `replications` table does not have. A slug that no longer resolves,
 * whose media has no URL, or whose kind the panel cannot draw, is skipped silently — a
 * curated list will always drift behind the data, and a broken tile is worse than a
 * shorter carousel.
 */
export function resolveFeaturedReplications(
  slugs: readonly string[],
  replications: readonly GalleryReplication[],
  effectNamesBySlug: ReadonlyMap<string, string>,
  seed: number,
): HomeFeaturedReplication[] {
  const bySlug = new Map(replications.map((replication) => [replication.slug, replication]));

  const resolved = slugs.flatMap((slug) => {
    const replication = bySlug.get(slug);

    // A row with no owning effect is skipped for the same reason a broken one
    // is: the panel's entire caption is "A replication of <effect>" wrapped
    // around a link to that effect's page, so without an effect there is nothing
    // to introduce and the link would point at `/effects/undefined`. Reading the
    // name off the missing slug threw here. Every curated slug resolves to a row
    // with an effect today, so the carousel is unchanged.
    // A published audio row is skipped on the same terms: the panel is a
    // still/video stage, so `isVisualReplication` is the kind it can draw.
    if (
      !replication?.url ||
      !replication.effect_slug ||
      !isVisualReplication(replication)
    ) {
      return [];
    }

    const effectName =
      effectNamesBySlug.get(replication.effect_slug) ?? humanizeSlug(replication.effect_slug);

    return [
      {
        replication,
        introduction: buildReplicationIntroduction(effectName),
        effectSlug: replication.effect_slug,
        effectName,
      },
    ];
  });

  return rotateBySeed(resolved, seed);
}

/* ------------------------------------------------------------- page payload */

export interface EffectIndexHomeData {
  /** Live count of effect articles, quoted in the intro paragraph. */
  effectCount: number;
  effectGroups: HomeFeaturedEffectGroup[];
  featuredArticle: HomeFeaturedArticle | null;
  featuredReports: HomeFeaturedReport[];
  featuredReplications: HomeFeaturedReplication[];
}
