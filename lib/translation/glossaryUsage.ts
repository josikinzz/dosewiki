import "server-only";

import { CORPORA } from "../../scripts/translation/corpora.mjs";
import { extractSegments } from "../../scripts/translation/segment-manifest.mjs";
import { stripMarkup } from "../../scripts/translation/markup.mjs";
import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import chemicalIndex from "@data/substances/chemicalIndexManual.json";
import psychoactiveIndex from "@data/substances/psychoactiveIndexManual.json";
import { resolveSubcategory, SUBCATEGORY_LABELS } from "../../src/data/subjectiveEffectSubcategories";
import { DOSE_TIERS, DURATION_STAGES } from "../../src/features/article/components/sections/dosageDurationLabels";
import { buildEffectArticleModel, EFFECT_ARTICLE_SECTION_TITLES, type SubjectiveEffectArticle } from "../../src/features/effects/articleSectionModel";
import { FLAT_CATEGORIES, PARENT_CATEGORIES, TABS } from "../../src/features/effects/pages/effectsIndexConfig";
import { buildGalleryBrowseUrl, type GalleryBrowseState } from "../../src/features/replications/galleryUrlState";
import { MEDIA_LABEL, MEDIA_OPTIONS, TAXONOMY_FILTER_CHIP_LABELS, TAXONOMY_FILTER_LABELS, TAXONOMY_FILTER_OPTIONS } from "../../src/features/replications/replicationVocabulary";
import type { GlossaryUsageNode, GlossaryUsageResponse } from "../../src/lib/glossary/glossaryUsage";
import type { SubstanceArticle } from "../../src/schema/substance/article";
import { getSubstanceSectionManifestEntries } from "../../src/schema/substance/sectionCatalog";
import { effectIndexViewPath } from "../../src/utils/indexViewRoutes";
import { publicHref } from "../../src/utils/publicHref";
import { getPublicRoutePath } from "../../src/utils/publicRouteIdentity";
import { getPublicDataReadAdapter, type PublicDataReadAdapter } from "../data/publicData.reads";
import { resolveRuntimePostgresTarget } from "../postgres/runtime/target";

const COVERAGE = "Canonical index and replication filter labels, plus headings, dosage and duration fields, and English text in public substance, effect, and published library articles. Counts are source locations, not pages or repeated mentions. Artist badges and other site content are not searched.";
const PAGE_SIZE = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;
const sections = getSubstanceSectionManifestEntries();
const subcategoryLabels = new Set(SUBCATEGORY_LABELS);
const normalize = (text: string) => text.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const words = (text: string) => normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const present = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(present);
  if (record(value)) return Object.values(value).some(present);
  return value != null && value !== "" && value !== false;
};

type IndexedNode = GlossaryUsageNode & { text: string };
export type GlossaryUsageIndex = {
  nodes: IndexedNode[];
  labels: Map<string, number[]>;
  postings: Map<string, number[]>;
};

/** Exact labels stay distinct: an Approved replicator is not a Verified replicator. */
function addNode(index: GlossaryUsageIndex, seen: Set<string>, node: GlossaryUsageNode, text: string) {
  if (seen.has(node.id) || !text.trim()) return;
  seen.add(node.id);
  const position = index.nodes.push({ ...node, text: normalize(text) }) - 1;
  const keys = node.kind === "label"
    ? new Set([normalize(text), normalize(text.replace(/^\d+\.\s+/, ""))])
    : new Set(words(text));
  const lookup = node.kind === "label" ? index.labels : index.postings;
  for (const key of keys) {
    const positions = lookup.get(key);
    if (positions) positions.push(position);
    else lookup.set(key, [position]);
  }
}

/** Only public adapter projections enter this index; raw documents and editorial reads do not. */
export async function buildGlossaryUsageIndex(reads: PublicDataReadAdapter): Promise<GlossaryUsageIndex> {
  const index: GlossaryUsageIndex = { nodes: [], labels: new Map(), postings: new Map() };
  const seen = new Set<string>();
  const add = (id: string, href: string, title: string, context: string, text: string, kind: GlossaryUsageNode["kind"] = "label") =>
    addNode(index, seen, { id, href, title, context, kind }, text);

  for (const tab of TABS) add(`effects:tab:${tab.id}`, effectIndexViewPath(tab.id), "Subjective Effect Index", `Tab: ${tab.label}`, tab.label);
  for (const category of EFFECT_CATEGORY_DEFINITIONS) {
    const href = publicHref.effectCategory(category.slug);
    add(`effect-category:${category.slug}`, href, category.name, "Category heading", category.name);
    add(`effect-category:${category.slug}:description`, href, category.name, "Category introduction", category.description, "content");
  }
  for (const category of PARENT_CATEGORIES) {
    const href = publicHref.effects();
    add(`effects:parent:${category.key}`, href, "Subjective Effect Index", `Panel: ${category.displayTitle ?? category.title}`, category.displayTitle ?? category.title);
    for (const child of category.subcategories) {
      if (child.title) add(`effects:subheading:${child.key}`, href, "Subjective Effect Index", `${category.displayTitle ?? category.title} > ${child.title}`, child.title);
    }
  }
  for (const category of FLAT_CATEGORIES) add(`effects:flat:${category.key}`, publicHref.effectCategory(category.routeSlug), category.title, "Effect category panel", category.title);
  for (const category of psychoactiveIndex.categories) {
    const href = publicHref.classification("psychoactive", category.label);
    add(`substances:class:${category.key}`, href, "Substance index", `Class: ${category.label}`, category.label);
    for (const section of category.sections) add(`substances:group:${category.key}:${section.key}`, href, "Substance index", `${category.label} > ${section.label}`, section.label);
  }
  for (const category of chemicalIndex.classes) {
    const href = publicHref.classification("chemical", category.key);
    add(`chemical:${category.key}`, href, category.label, "Chemical class heading", category.label);
    for (const alias of category.aliases) add(`chemical:${category.key}:alias:${normalize(alias)}`, href, category.label, `Chemical class alias: ${alias}`, alias);
  }
  for (const key of Object.keys(TAXONOMY_FILTER_OPTIONS) as Array<keyof typeof TAXONOMY_FILTER_OPTIONS>) {
    const label = TAXONOMY_FILTER_LABELS[key];
    const chipLabel = TAXONOMY_FILTER_CHIP_LABELS[key];
    add(`replications:filter:${key}`, buildGalleryBrowseUrl(), "Replication Gallery", `Filter: ${label}`, label);
    if (chipLabel !== label) add(`replications:chip:${key}`, buildGalleryBrowseUrl(), "Replication Gallery", `Active filter: ${chipLabel}`, chipLabel);
    for (const option of TAXONOMY_FILTER_OPTIONS[key]) {
      if (option.value === "all") continue;
      const href = buildGalleryBrowseUrl({ [key]: option.value } as Partial<GalleryBrowseState>);
      add(`replications:filter:${key}:${option.value}`, href, "Replication Gallery", `${label}: ${option.label}`, option.label);
    }
  }
  add("replications:filter:media", buildGalleryBrowseUrl(), "Replication Gallery", `Filter: ${MEDIA_LABEL}`, MEDIA_LABEL);
  for (const option of MEDIA_OPTIONS) {
    add(`replications:filter:media:${option.value}`, buildGalleryBrowseUrl({ type: option.value as GalleryBrowseState["type"] }), "Replication Gallery", `${MEDIA_LABEL}: ${option.label}`, option.label);
  }

  const [substances, effects, articles] = await Promise.all([
    reads.getPublicSubstanceDocuments(), reads.getPublicEffectArticles(), reads.getPublishedEffectIndexArticles(),
  ]);
  for (const substance of substances) {
    const href = publicHref.substance(substance.slug);
    const title = substance.title;
    // The public projection is schema-parsed. Restrict even that projection to published article fields.
    const source: Record<string, unknown> = { slug: substance.slug };
    for (const section of sections) {
      if (!section.public.visible && section.id !== "summary") continue;
      for (const field of section.articleFields) source[field] = substance[field as keyof typeof substance];
      if (section.public.toc && section.articleFields.some((field) => present(source[field])) && (!section.public.isPresent || section.public.isPresent(substance as SubstanceArticle))) {
        add(`substance:${substance.slug}:heading:${section.id}`, `${href}#${section.id}`, title, `Section heading: ${section.label}`, section.label);
      }
    }
    for (const segment of extractSegments({ items: [source] }, CORPORA.substances).segments) {
      const section = sections.find((entry) => entry.public.visible && entry.articleFields.includes(segment.group as never));
      const destination = section?.public.toc ? `${href}#${section.id}` : href;
      add(`substance:${substance.slug}:field:${segment.path}`, destination, title, `Field: ${segment.path}`, stripMarkup(segment.source), "content");
    }
    const walkHeadings = (value: unknown, path: string[]) => {
      if (!record(value)) return;
      for (const [key, child] of Object.entries(value)) {
        if (!record(child)) continue;
        const label = resolveSubcategory(key).label;
        if (subcategoryLabels.has(label) && present(child)) add(`substance:${substance.slug}:heading:${[...path, key].join("/")}`, `${href}#subjective-effects`, title, `Subjective Effects > ${label}`, label);
        walkHeadings(child, [...path, key]);
      }
    };
    walkHeadings(substance.subjective_effects, ["subjective_effects"]);
    for (const [group, list, field] of [["dosage", DOSE_TIERS, "dose_ranges"], ["duration", DURATION_STAGES, "stages"]] as const) {
      const value = substance[group];
      if (!record(value) || !Array.isArray(value.routes)) continue;
      value.routes.forEach((route, routeIndex) => {
        if (!record(route) || !record(route[field])) return;
        const ranges = route[field];
        for (const tier of list) {
          if (present(ranges[tier.key])) add(`substance:${substance.slug}:${group}:${routeIndex}:${tier.key}`, `${href}#dosage-duration`, title, `${group === "dosage" ? "Dosage" : "Duration"} > ${String(route.route ?? routeIndex + 1)} > ${tier.label}`, tier.label);
        }
      });
    }
  }
  for (const effect of effects) {
    const href = publicHref.effect(effect.slug);
    add(`effect:${effect.slug}:name`, href, effect.name, "Effect name", effect.name);
    const source = { slug: effect.slug, name: effect.name, summary: effect.summary, description_raw: effect.description_raw, analysis_raw: effect.analysis_raw, style_variations_raw: effect.style_variations_raw, personal_commentary_raw: effect.personal_commentary_raw };
    for (const segment of extractSegments({ items: [source] }, CORPORA.effects).segments) {
      if (segment.group === "name") continue;
      add(`effect:${effect.slug}:field:${segment.path}`, href, effect.name, `Field: ${segment.path}`, stripMarkup(segment.source), "content");
    }
    for (const section of buildEffectArticleModel({ effect: effect as SubjectiveEffectArticle }).sections) {
      const label = EFFECT_ARTICLE_SECTION_TITLES[section.kind];
      add(`effect:${effect.slug}:heading:${section.id}`, `${href}#${section.id}`, effect.name, `Section: ${label}`, label);
    }
  }
  for (const article of articles) {
    if (article.publication_status !== "published" || article.kind === "blog") continue;
    const href = getPublicRoutePath({ family: "article", params: { slug: article.slug } });
    const source = { slug: article.slug, title: article.title, shortDescription: article.shortDescription, body_raw: article.body_raw };
    for (const segment of extractSegments({ items: [source] }, CORPORA.articles).segments) add(`article:${article.slug}:field:${segment.path}`, href, article.title, `Field: ${segment.path}`, stripMarkup(segment.source), "content");
  }
  return index;
}

/** Literal word-boundary matching. No stemming: plural and singular semantic labels remain independent. */
export function queryGlossaryUsage(index: GlossaryUsageIndex, term: string, offset = 0): GlossaryUsageResponse {
  const key = normalize(term);
  const matches = new Set(index.labels.get(key) ?? []);
  const tokens = [...new Set(words(term))];
  const candidates = tokens.map((token) => index.postings.get(token) ?? []).sort((a, b) => a.length - b.length)[0] ?? [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "u");
  for (const position of candidates) if (pattern.test(index.nodes[position].text)) matches.add(position);
  const nodes = [...matches].map((position) => index.nodes[position]).sort((a, b) => a.kind.localeCompare(b.kind) * -1 || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return {
    term,
    nodes: nodes.slice(offset, offset + PAGE_SIZE).map(({ text: _text, ...node }) => node),
    totalSourceNodes: nodes.length,
    nextOffset: offset + PAGE_SIZE < nodes.length ? offset + PAGE_SIZE : null,
    coverage: COVERAGE,
  };
}

// Like publicLibrary's derived index, this stays process-local, not a multi-megabyte Next cache entry.
// Share cold reads across every expanded term, and drop rejected snapshots so retry is real.
let snapshot: { target: string; reads: PublicDataReadAdapter; expiresAt: number; promise: Promise<GlossaryUsageIndex> } | undefined;
export async function getGlossaryUsage(term: string, offset = 0): Promise<GlossaryUsageResponse> {
  const reads = getPublicDataReadAdapter();
  const target = resolveRuntimePostgresTarget().url;
  if (!snapshot || snapshot.target !== target || snapshot.reads !== reads || snapshot.expiresAt <= Date.now()) {
    const next = { target, reads, expiresAt: Infinity, promise: buildGlossaryUsageIndex(reads) };
    snapshot = next;
    next.promise.then(() => { next.expiresAt = Date.now() + CACHE_TTL_MS; }, () => { if (snapshot === next) snapshot = undefined; });
  }
  return queryGlossaryUsage(await snapshot.promise, term, offset);
}
