import type { IconName } from "@/components/common/Icon";
import { msg } from "@/i18n/messages";
import { ARTICLE_GUIDES_BY_CLASS, GUIDE_CLASSES } from "./articleGuides";

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
  readMinutes?: number;
  indexDescription?: string;
  /**
   * Writing-system fields. A row written in the Writing tab carries
   * `bodyFormat: "markdown"`; every legacy Effect Index import carries neither
   * of these, which is what keeps the archive grouped exactly as it was.
   */
  kind?: "article" | "blog";
  bodyFormat?: "vcode" | "markdown";
}

export interface ArticleIndexRow {
  slug: string;
  title: string;
  /** The editor's blurb, or the body's opening sentence when none was written. */
  description?: string;
  /** "May 2021": the day carries no meaning for archive material. */
  /** Publication month as "YYYY-MM", or the raw date string when it has no month; rendered per locale. */
  publishedMonth?: string;
  /** Reading time in minutes, rendered per locale. */
  readMinutes?: number;
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
  /** Slugs claimed outright, checked before tags so a guide tagged "intensity scale" still files as a guide. */
  slugs?: readonly string[];
}

const GROUP_DEFINITIONS: readonly ArticleGroupDefinition[] = [
  {
    id: "drug-guides",
    label: msg("Drug guides"),
    icon: "lucide:flask-conical",
    blurb: msg("Single-substance guides that walk the experience end to end."),
    tags: [],
    // The curated guide map is the one place that decides what counts as a
    // drug guide; the tags on these rows only say "intensity scale".
    slugs: GUIDE_CLASSES.flatMap((guideClass) =>
      ARTICLE_GUIDES_BY_CLASS[guideClass].guides.map((guide) => guide.slug),
    ),
  },
  {
    id: "scales",
    label: msg("Intensity & rating scales"),
    icon: "lucide:ruler",
    blurb: msg("Level-by-level models of experience intensity, in the lineage of the Shulgin Rating Scale."),
    tags: ["intensity scale", "rating scale"],
  },
  {
    id: "consciousness",
    label: msg("Dreaming & consciousness"),
    icon: "lucide:moon",
    blurb: msg("Guides to dream states, lucidity, and the practices used to explore them."),
    tags: ["dreams", "meditation", "psychonautics"],
  },
];

/**
 * New writing, as opposed to the frozen archive. The archive is finished, so a
 * piece written today would otherwise be filed by subject alongside material
 * from 2019 and be invisible; this group puts it at the top of the index until
 * the archive framing stops being the page's organising idea.
 *
 * Membership is by body language, not by date: a Markdown body can only have
 * been written in the Writing tab, because every imported row is VCode.
 */
const RECENT_GROUP: Omit<ArticleGroupDefinition, "tags"> = {
  id: "recent",
  label: msg("Recent"),
  icon: "lucide:sparkles",
  blurb: msg("Newly published writing, straight from the editor."),
};

const FALLBACK_GROUP: Omit<ArticleGroupDefinition, "tags"> = {
  id: "reference",
  label: msg("Reference & other writing"),
  icon: "lucide:notebook-text",
  blurb: msg("Short definitional pages and notes the rest of the archive refers back to."),
};

/** Bracketed VCode markup (`[h2]`, `[ref url=…]`) is chrome, not prose. */
const VCODE_TAG_PATTERN = /\[[^\]]*\]/g;

/**
 * Heading text, VCode `[h2]…[/h2]` or a Markdown `## …` line, is a label rather
 * than a sentence: it has no full stop, so left in it would fuse with the first
 * real sentence ("Onset Onset is the point…").
 */
const HEADING_PATTERN = /\[h[1-6]\][\s\S]*?\[\/h[1-6]\]|^#{1,6}\s.*$/gm;

const WORDS_PER_MINUTE = 220;

/**
 * A fallback description is a glance, not a paragraph: long enough to say what
 * the page is about, short enough to share a line with the title.
 */
const DESCRIPTION_LIMIT = 140;

/** Body text with VCode chrome stripped and whitespace collapsed; empty when there is no body. */
function bodyProse(body: string | undefined): string {
  return (body ?? "").replace(VCODE_TAG_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function readMinutesOf(prose: string): number | undefined {
  if (prose.length === 0) {
    return undefined;
  }

  const words = prose.split(" ").length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Reading time in minutes for an article body, or `undefined` when there is nothing to measure.
 *
 * Exported so the Effect Index homepage's Featured Article panel quotes the same figure the
 * articles index does. The two surfaces show the same article, so a second estimate would
 * make the site contradict itself.
 */
export function articleReadMinutes(body: string | undefined): number | undefined {
  return readMinutesOf(bodyProse(body));
}

/** "2021-05" from an ISO date, or the raw value when it carries no month. */
function publishedMonthOf(publicationDate: string | undefined): string | undefined {
  if (!publicationDate) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})/.exec(publicationDate);

  return match ? `${match[1]}-${match[2]}` : publicationDate;
}

/**
 * The body's opening sentence, for rows whose editor never wrote a blurb.
 * Headings are dropped first (they still count toward reading time), then the
 * text is cut at the first sentence end and, past the limit, on a word boundary,
 * so a truncated fragment still reads as prose rather than as a cut-off word.
 */
export function deriveDescription(body: string | undefined): string | undefined {
  const prose = bodyProse(body?.replace(HEADING_PATTERN, " "));

  if (prose.length === 0) {
    return undefined;
  }

  const sentenceEnd = /[.!?](?=\s|$)/.exec(prose);
  const sentence = sentenceEnd ? prose.slice(0, sentenceEnd.index + 1) : prose;

  if (sentence.length <= DESCRIPTION_LIMIT) {
    return sentence;
  }

  const cut = sentence.lastIndexOf(" ", DESCRIPTION_LIMIT);
  const head = sentence.slice(0, cut > 0 ? cut : DESCRIPTION_LIMIT);

  return `${head.replace(/[\s,;:]+$/, "")}…`;
}

function matchGroupDefinition(entry: ArticleIndexEntry): ArticleGroupDefinition | undefined {
  const normalized = entry.tags.map((tag) => tag.trim().toLowerCase());

  return (
    GROUP_DEFINITIONS.find((definition) => definition.slugs?.includes(entry.slug)) ??
    GROUP_DEFINITIONS.find((definition) =>
      definition.tags.some((tag) => normalized.includes(tag)),
    )
  );
}

function toIndexRow(entry: ArticleIndexEntry): ArticleIndexRow {
  const description = entry.shortDescription?.trim();

  return {
    slug: entry.slug,
    title: entry.title,
    description:
      description && description.length > 0
        ? description
        : entry.indexDescription ?? deriveDescription(entry.body_raw),
    publishedMonth: publishedMonthOf(entry.publicationDate),
    readMinutes: entry.readMinutes ?? readMinutesOf(bodyProse(entry.body_raw)),
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
    const isRecent = entry.bodyFormat === "markdown";
    const definition = isRecent ? undefined : matchGroupDefinition(entry);
    const groupId = isRecent ? RECENT_GROUP.id : definition?.id ?? FALLBACK_GROUP.id;
    const rows = grouped.get(groupId) ?? [];

    rows.push(toIndexRow(entry));
    grouped.set(groupId, rows);
  }

  return [RECENT_GROUP, ...GROUP_DEFINITIONS, FALLBACK_GROUP].flatMap(
    ({ id, label, icon, blurb }) => {
      const articles = grouped.get(id);

      return articles && articles.length > 0
        ? [{ id, label, icon, blurb, articles }]
        : [];
    },
  );
}
