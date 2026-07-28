import type { IconName } from "@/components/common/Icon";

/**
 * Index model for the published Effect Index articles.
 *
 * The archive is a small, deliberately uneven set: a handful of long-form
 * guides and level-by-level scales sit beside two-hundred-word definitional
 * pages. A flat list makes those read as equals, so the index partitions by
 * subject and carries a length signal per row.
 */

export interface ArticleIndexEntry {
  slug: string;
  title: string;
  tags: string[];
  shortDescription?: string;
  publicationDate?: string;
  body_raw?: string;
}

export type ArticleRowDensity = "full" | "compact";

export interface ArticleIndexRow {
  slug: string;
  title: string;
  description?: string;
  /** "May 2021" — the day carries no meaning for archive material. */
  dateLabel?: string;
  lengthLabel?: string;
  /** Tags the group heading does not already say. */
  tags: string[];
  density: ArticleRowDensity;
}

export interface ArticleIndexGroup {
  id: string;
  label: string;
  icon: IconName;
  blurb: string;
  articles: ArticleIndexRow[];
}

interface ArticleGroupDefinition {
  id: string;
  label: string;
  icon: IconName;
  blurb: string;
  /** Lowercased tags that claim an article for this group. */
  tags: readonly string[];
}

const GROUP_DEFINITIONS: readonly ArticleGroupDefinition[] = [
  {
    id: "scales",
    label: "Intensity & rating scales",
    icon: "lucide:ruler",
    blurb:
      "Level-by-level models of experience intensity, written in the lineage of the Shulgin Rating Scale.",
    tags: ["intensity scale", "rating scale"],
  },
  {
    id: "consciousness",
    label: "Dreaming & consciousness",
    icon: "lucide:moon",
    blurb:
      "Long-form guides to dream states, lucidity, and the practices used to explore them.",
    tags: ["dreams", "meditation", "psychonautics"],
  },
];

const FALLBACK_GROUP: Omit<ArticleGroupDefinition, "tags"> = {
  id: "reference",
  label: "Reference & other writing",
  icon: "lucide:notebook-text",
  blurb:
    "Short definitional pages and supporting notes the rest of the archive refers back to.",
};

const MONTH_LABELS = [
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

/** Bracketed VCode markup (`[h2]`, `[ref url=…]`) is chrome, not prose. */
const VCODE_TAG_PATTERN = /\[[^\]]*\]/g;

const WORDS_PER_MINUTE = 220;

/**
 * Under this, a page is a definition rather than an article. Those entries get
 * a compact row wherever they land, so a 220-word glossary entry never wears
 * the same weight as a 5,000-word guide sitting above it.
 */
const REFERENCE_WORD_LIMIT = 400;

function countBodyWords(body: string | undefined): number {
  if (!body) {
    return 0;
  }

  const prose = body.replace(VCODE_TAG_PATTERN, " ").replace(/\s+/g, " ").trim();

  return prose.length > 0 ? prose.split(" ").length : 0;
}

function formatLengthLabel(words: number): string | undefined {
  if (words === 0) {
    return undefined;
  }

  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`;
}

function formatDateLabel(publicationDate: string | undefined): string | undefined {
  if (!publicationDate) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})/.exec(publicationDate);

  if (!match) {
    return publicationDate;
  }

  const monthLabel = MONTH_LABELS[Number(match[2]) - 1];

  return monthLabel ? `${monthLabel} ${match[1]}` : match[1];
}

function matchGroupDefinition(tags: string[]): ArticleGroupDefinition | undefined {
  const normalized = tags.map((tag) => tag.trim().toLowerCase());

  return GROUP_DEFINITIONS.find((definition) =>
    definition.tags.some((tag) => normalized.includes(tag)),
  );
}

function toIndexRow(
  entry: ArticleIndexEntry,
  claimedTags: readonly string[],
): ArticleIndexRow {
  const words = countBodyWords(entry.body_raw);
  const description = entry.shortDescription?.trim();

  return {
    slug: entry.slug,
    title: entry.title,
    description: description && description.length > 0 ? description : undefined,
    dateLabel: formatDateLabel(entry.publicationDate),
    lengthLabel: formatLengthLabel(words),
    // A tag the group heading already states is noise; anything else is signal.
    tags: entry.tags.filter(
      (tag) => !claimedTags.includes(tag.trim().toLowerCase()),
    ),
    density: words > 0 && words < REFERENCE_WORD_LIMIT ? "compact" : "full",
  };
}

/**
 * Partition published articles into the index sections, preserving the order
 * the read model returned (newest first) inside each group.
 */
export function groupArticlesForIndex(
  entries: ArticleIndexEntry[],
): ArticleIndexGroup[] {
  const grouped = new Map<string, ArticleIndexRow[]>();

  for (const entry of entries) {
    const definition = matchGroupDefinition(entry.tags);
    const groupId = definition?.id ?? FALLBACK_GROUP.id;
    const rows = grouped.get(groupId) ?? [];

    rows.push(toIndexRow(entry, definition?.tags ?? []));
    grouped.set(groupId, rows);
  }

  return [...GROUP_DEFINITIONS, FALLBACK_GROUP].flatMap(
    ({ id, label, icon, blurb }) => {
      const articles = grouped.get(id);

      return articles && articles.length > 0
        ? [{ id, label, icon, blurb, articles }]
        : [];
    },
  );
}
