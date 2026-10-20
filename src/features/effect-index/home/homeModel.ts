import {
  isVisualReplication,
  type GalleryReplication,
} from "@/types/replications";

export function rotateBySeed<T>(items: readonly T[], seed: number): T[] {
  if (items.length === 0) {
    return [];
  }

  const normalized = Math.abs(Math.trunc(seed)) % items.length;

  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

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
  label: string;
  effects: HomeFeaturedEffect[];
}

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

    return matches.length > 0 ? [{ id, label, effects: matches }] : [];
  });
}

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
  authorLine?: string;
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

function formatFeaturedArticleDate(publicationDate: string | undefined): string | undefined {
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

function isDisplayableAuthorName(name: string): boolean {
  return !/^[0-9a-f]{24}$/i.test(name);
}

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
  substanceName: string;
  doseLine: string;
}

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

export interface HomeFeaturedReplication {
  replication: GalleryReplication;
  introduction: string;
  effectSlug: string;
  effectName: string;
}

export function buildReplicationIntroduction(effectName: string): string {
  return /^[aeiou]/i.test(effectName.trim())
    ? "A replication of an "
    : "A replication of ";
}

function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

export function resolveFeaturedReplications(
  slugs: readonly string[],
  replications: readonly GalleryReplication[],
  effectNamesBySlug: ReadonlyMap<string, string>,
  seed: number,
): HomeFeaturedReplication[] {
  const bySlug = new Map(replications.map((replication) => [replication.slug, replication]));

  const resolved = slugs.flatMap((slug) => {
    const replication = bySlug.get(slug);

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

export interface EffectIndexHomeData {
  effectCount: number;
  effectGroups: HomeFeaturedEffectGroup[];
  featuredArticle: HomeFeaturedArticle | null;
  featuredReports: HomeFeaturedReport[];
  featuredReplications: HomeFeaturedReplication[];
}
