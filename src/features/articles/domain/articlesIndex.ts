import type { IconName } from "@/components/common/Icon";
import { msg } from "@/i18n/messages";
import { ARTICLE_GUIDES_BY_CLASS, GUIDE_CLASSES } from "./articleGuides";

export interface ArticleIndexEntry {
  slug: string;
  title: string;
  tags: string[];
  shortDescription?: string;
  publicationDate?: string;
  body_raw?: string;
  readMinutes?: number;
  indexDescription?: string;
  kind?: "article" | "blog";
  bodyFormat?: "vcode" | "markdown";
}

export interface ArticleIndexRow {
  slug: string;
  title: string;
  description?: string;
  publishedMonth?: string;
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
  tags: readonly string[];
  slugs?: readonly string[];
}

const GROUP_DEFINITIONS: readonly ArticleGroupDefinition[] = [
  {
    id: "drug-guides",
    label: msg("Drug guides"),
    icon: "lucide:flask-conical",
    blurb: msg("Single-substance guides that walk the experience end to end."),
    tags: [],
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

const VCODE_TAG_PATTERN = /\[[^\]]*\]/g;

const HEADING_PATTERN = /\[h[1-6]\][\s\S]*?\[\/h[1-6]\]|^#{1,6}\s.*$/gm;

const WORDS_PER_MINUTE = 220;

const DESCRIPTION_LIMIT = 140;

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

export function articleReadMinutes(body: string | undefined): number | undefined {
  return readMinutesOf(bodyProse(body));
}

function publishedMonthOf(publicationDate: string | undefined): string | undefined {
  if (!publicationDate) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})/.exec(publicationDate);

  return match ? `${match[1]}-${match[2]}` : publicationDate;
}

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
