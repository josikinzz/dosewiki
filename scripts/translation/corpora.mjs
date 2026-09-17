/**
 * Corpus descriptors.
 *
 * One runner translates five bodies of text that agree on nothing: a published
 * JSON export keyed by slug, five VCode bodies per effect, nine long-form
 * documents that live only in Postgres, first-person reports with a timeline,
 * and a flat table of copy blocks layered over checked-in defaults. A corpus
 * says where its items come from, what identifies one, which keys are machine
 * data, and which fields hold markup. Everything else is shared machinery.
 *
 * Adding a locale is configuration. Adding a corpus is one object here.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { makeFunctionReference } from "../../lib/postgres/runtime/api.ts";

/** Resolved on call: loaders only run in the CLI, and a bundled import must not need a file URL at load. */
const repoRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const OPEN_DATA = "https://dose.wiki/open-data";

/**
 * Bibliography and chemical identity never travel to a translation model. A
 * reader looking up a paper needs the title exactly as published, and a CAS
 * number or SMILES string is not language.
 */
export const SUBSTANCE_EXCLUDED_GROUPS = Object.freeze([
  "references",
  "citations",
  "source_citations",
  "identification",
  "classification",
  "index_categories",
  "id",
  "slug",
  "title",
  "priority",
]);

/**
 * Keys whose values are enumerations, identifiers, or bare measurements. A
 * route name keys an icon map, a level keys a badge tone, and a molecular
 * formula is not language.
 */
export const SUBSTANCE_EXCLUDED_KEYS = Object.freeze([
  "canonicalStatus",
  "cas_number",
  "half_life",
  "human_epidemiological",
  "icon",
  "id",
  "image",
  "inchi_key",
  "iupac_name",
  "key",
  "level",
  "metabolites",
  "molecular_formula",
  "molecular_weight",
  "reference_id",
  "reference_ids",
  "route",
  "slug",
  "smiles",
  "species",
  "target",
  "type",
  "unit",
  "url",
]);

/**
 * Keys that are display text only while a sibling machine key carries the
 * meaning. `legality.countries.*.status` is mixed: where `canonicalStatus`
 * exists the badge reads that, and the bare status is prose.
 */
export const SUBSTANCE_CONDITIONAL_KEYS = Object.freeze({ status: "canonicalStatus" });

/** Field groups where a fluent mistranslation does real harm. */
export const SUBSTANCE_SAFETY_GROUPS = Object.freeze([
  "dosage",
  "duration",
  "interactions",
  "harm_potential",
  "legality",
]);

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function postgresQuery(functionPath, args = {}) {
  const { client } = createDataClient({ target: process.env.SOURCE_POSTGRES_URL ?? null });
  try {
    return await client.query(makeFunctionReference(functionPath), args);
  } finally {
    await client.end?.();
  }
}

/** A published open-data export, or a local copy of one. */
function openDataLoader(datasetName) {
  return async (source) => {
    const origin = source ?? `${OPEN_DATA}/${datasetName}.json`;
    if (!/^https?:\/\//.test(origin)) {
      const absolute = path.resolve(repoRoot(), origin);
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    return { dataset: await fetchJson(origin), origin };
  };
}

/**
 * Envelope for a corpus read straight from Postgres. Editor writing and copy
 * are CC0 per /docs/license; the open-data exports carry their own licence
 * strings and never pass through here.
 */
function envelope(name, items, source) {
  return {
    dataset: name,
    generatedAt: new Date().toISOString(),
    count: items.length,
    license: "CC0 1.0 (public domain)",
    licenseUrl: "https://dose.wiki/docs/license",
    source,
    items,
  };
}

const SUBSTANCE_CORPUS = {
  id: "substances",
  label: "Substance index",
  dataset: "SubstanceIndex",
  itemKey: "slug",
  defaultSource: `${OPEN_DATA}/SubstanceIndex.json`,
  load: openDataLoader("SubstanceIndex"),
  excludedGroups: SUBSTANCE_EXCLUDED_GROUPS,
  excludedKeys: SUBSTANCE_EXCLUDED_KEYS,
  conditionalKeys: SUBSTANCE_CONDITIONAL_KEYS,
  safetyGroups: SUBSTANCE_SAFETY_GROUPS,
  markupFields: Object.freeze({}),
};

/**
 * Five prose bodies per effect, each stored as raw VCode beside an optional
 * parsed tree. The tree is derived, so it is never translated and never sent
 * anywhere: it is recomputed from the translated raw and checked against the
 * source tree.
 */
const EFFECT_MARKUP_FIELDS = Object.freeze({
  description_raw: "description_ast",
  long_summary_raw: "long_summary_ast",
  analysis_raw: "analysis_ast",
  style_variations_raw: "style_variations_ast",
  personal_commentary_raw: "personal_commentary_ast",
});

const EFFECT_CORPUS = {
  id: "effects",
  label: "Effect index",
  dataset: "EffectIndex",
  itemKey: "slug",
  defaultSource: `${OPEN_DATA}/EffectIndex.json`,
  load: openDataLoader("EffectIndex"),
  excludedGroups: Object.freeze([
    "citations",
    "gallery_order",
    "tags",
  ]),
  excludedKeys: Object.freeze([
    "slug",
    "featured",
    "social_media_image",
    "contributors",
    "location",
    "url",
    "id",
    // Anchor targets: `?s=<id>` links resolve against these.
    "_id",
    // Audio replications: the clip title and description translate; the
    // artist, the file, and the rights fields are attribution and stay.
    "artist",
    "artist_url",
    "resource",
    "rights_status",
    "license_name",
    "license_url",
    "credit_line",
    "source_url",
    "rightsholder",
    "permission_notes",
    "removal_contact",
  ]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: EFFECT_MARKUP_FIELDS,
};

/**
 * The nine curated long-form articles. They exist only in Postgres, and the
 * table also holds a blog row that every consumer filters on `kind`; an
 * exporter that skips the filter ships a test post as a tenth article.
 */
const ARTICLE_CORPUS = {
  id: "articles",
  label: "Long-form articles",
  dataset: "Articles",
  itemKey: "slug",
  defaultSource: "data:effectIndexArticles:getAll",
  load: async (source) => {
    const origin = source ?? "data:effectIndexArticles:getAll";
    if (!origin.startsWith("data:")) {
      const absolute = path.resolve(repoRoot(), origin);
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    const rows = await postgresQuery("effectIndexArticles:getAll");
    const items = rows
      .filter((row) => row.kind !== "blog" && row.publication_status === "published")
      // Postgres bookkeeping and the raw author ObjectIds, which are never shown.
      .map(({ _id: _identifier, _creationTime: _created, authors: _authors, ...rest }) => rest)
      .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
    return { dataset: envelope("Articles", items, `Postgres effectIndexArticles:getAll`), origin };
  },
  excludedGroups: Object.freeze(["citations", "tags", "authorProfileKeys"]),
  excludedKeys: Object.freeze([
    "slug",
    "featured",
    "publication_status",
    "publicationDate",
    "coverImageUrl",
    "bodyFormat",
    "kind",
    "status",
  ]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({ body_raw: "body_ast" }),
};

/**
 * First-person reports. Times, units and the substance names beside them are
 * the record; the narrative, and the free-text dose and route lines authors
 * write beside a substance ("2.5g Syrian rue / 6g Mimosa rootbark", "Oral,
 * baked into a cupcake"), are translated, with the numbers held by the
 * validator. Every record keeps its own licence and its byline, because the
 * translation is a derivative of someone else's already-published writing.
 */
const REPORT_CORPUS = {
  id: "reports",
  label: "Trip reports",
  dataset: "TripReports",
  itemKey: "slug",
  defaultSource: `${OPEN_DATA}/TripReports.json`,
  load: openDataLoader("TripReports"),
  excludedGroups: Object.freeze(["tags", "published_at", "license"]),
  excludedKeys: Object.freeze([
    "slug",
    "featured",
    "attribution_locked",
    "license",
    "published_at",
    "profile_key",
    "avatar_url",
    "pdf_url",
    "trip_date",
    "age",
    "height",
    "weight",
    // A substance name is a proper noun. A timeline stamp ("T+1:30", "After
    // 10:40 PM") is free text: the number gate holds its digits and a bare
    // stamp with nothing to translate is rejected as UNTRANSLATED and stays.
    "name",
  ]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

/**
 * Replication media records: one reader-visible sentence each, the work's
 * title. Everything else on the row is the record: the artist is a proper
 * noun, the rights fields are attribution, the effect slug and tag arrays key
 * filters, the storage keys and URLs locate media, and the date, size and
 * duration are measurements. The runtime is the only consumer (there is no
 * batch export), so the loader reads the published rows straight from Postgres.
 */
const REPLICATION_CORPUS = {
  id: "replications",
  label: "Replications",
  dataset: "Replications",
  itemKey: "slug",
  defaultSource: "data:replications:getAll",
  load: async (source) => {
    const origin = source ?? "data:replications:getAll";
    if (!origin.startsWith("data:")) {
      const absolute = path.resolve(repoRoot(), origin);
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    const rows = await postgresQuery("replications:getAll");
    const items = rows
      .filter((row) => (row.publication_state ?? "published") === "published")
      .map(({ _id: _identifier, _creationTime: _created, ...rest }) => rest)
      .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
    return { dataset: envelope("Replications", items, `Postgres replications:getAll`), origin };
  },
  excludedGroups: Object.freeze([
    "effect_tags",
    "viewing_mode_tags",
    "title_drugs",
    "drug_classes",
    "content_tags",
    "artist_type_tags",
    "date_info",
    "effect_order_index",
    "title_class_mentions",
  ]),
  excludedKeys: Object.freeze([
    "_id",
    "_creationTime",
    "slug",
    "artist",
    "artist_url",
    "role",
    "publication_state",
    "duplicate_of_replication_id",
    "duplicate_evidence_digest",
    "duplicate_operation_id",
    "duplicate_suppressed_at",
    "type",
    "storage_id",
    "effect_slug",
    "source_sha256",
    "replication_status",
    "viewing_mode",
    "content_family",
    "artist_primary_type",
    "thumbnail_storage_id",
    "preview_storage_id",
    "motion_storage_id",
    "motion_poster_storage_id",
    "r2_key",
    "thumbnail_r2_key",
    "preview_r2_key",
    "motion_r2_key",
    "motion_poster_r2_key",
    "width",
    "height",
    "format",
    "file_size",
    "duration",
    "has_audio",
    "created_at",
    // Rights and attribution: a credit line names people, a licence is a
    // proper noun, a removal contact is an address.
    "rights_status",
    "license_name",
    "license_url",
    "credit_line",
    "source_url",
    "rightsholder",
    "permission_notes",
    "removal_contact",
    // Resolved media locations.
    "url",
    "thumbnail_url",
    "preview_url",
    "motion_url",
    "motion_poster_url",
    // Taxonomy bookkeeping on the full row: confidence enums, review flags,
    // the CAS record key and digest, and the showcase placement flag.
    "content_family_confidence",
    "content_family_review_required",
    "replication_status_confidence",
    "replication_status_review_required",
    "viewing_mode_confidence",
    "viewing_mode_review_required",
    "taxonomy_record_key",
    "taxonomy_review_required",
    "taxonomy_source_digest",
    "taxonomy_updated_at",
    "taxonomy_version",
    "showcase_excluded",
  ]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

/**
 * Sitewide copy. Production is Postgres rows layered over the checked-in
 * defaults, exactly as `createCopyResolver` resolves them, so a corpus built
 * from the JSON alone would miss the ten keys that exist only in Postgres and
 * would translate sixteen strings the site no longer shows.
 */
const COPY_CORPUS = {
  id: "copy",
  label: "Sitewide copy",
  dataset: "CopyBlocks",
  itemKey: "key",
  defaultSource: "data:copyBlocks:getAll",
  load: async (source) => {
    const origin = source ?? "data:copyBlocks:getAll";
    if (!origin.startsWith("data:")) {
      const absolute = path.resolve(repoRoot(), origin);
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    const defaults = JSON.parse(await readFile(path.join(repoRoot(), "content/copy-blocks/copyBlocks.json"), "utf8"));
    const rows = await postgresQuery("copyBlocks:getAll");
    const byKey = new Map();
    for (const definition of defaults) byKey.set(definition.key, { ...definition, source: "default" });
    for (const row of rows) {
      const { _id: _identifier, _creationTime: _created, updatedAt: _updatedAt, updatedBy: _updatedBy, ...rest } = row;
      byKey.set(row.key, { ...rest, source: "server" });
    }
    const items = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { dataset: envelope("CopyBlocks", items, `Postgres copyBlocks:getAll over content/copy-blocks/copyBlocks.json`), origin };
  },
  excludedGroups: Object.freeze([]),
  excludedKeys: Object.freeze(["key", "kind", "flavor", "group", "label", "source"]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

/**
 * The layout and taxonomy registry, extracted from the live section catalog,
 * field registry, closed enums and curated indexes by `export-registry.ts`.
 * Only `label` and `description` are prose. Every machine key travels
 * untouched, because a consumer joins on keys and displays labels, and a
 * translated key resolves to nothing.
 */
const LAYOUT_CORPUS = {
  id: "layout",
  label: "Layout and taxonomy",
  dataset: "Layout",
  itemKey: "key",
  defaultSource: "notes-and-plans/exports/translation/registry/Layout.json",
  load: async (source) => {
    const origin = source ?? "notes-and-plans/exports/translation/registry/Layout.json";
    const absolute = path.resolve(repoRoot(), origin);
    if (!existsSync(absolute)) {
      throw new Error(`No layout registry at ${origin}. Run: npm run translate:registry`);
    }
    return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
  },
  excludedGroups: Object.freeze(["machine", "fields"]),
  excludedKeys: Object.freeze(["key", "kind", "icon", "ordinal", "slug", "value", "target", "parentKey", "copyKey"]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

/**
 * The five psychoactive summaries (visual, cognitive and miscellaneous effects
 * of psychedelics; dissociatives; deliriants). They are code, not data: a
 * checked-in TypeScript module whose sections select effects by tag at render
 * time and pull each effect's long summary from the Effect Index. The corpus
 * carries the prose that is the summary's own (intro paragraphs, section
 * definitions, titles) plus the resolved effect slugs per section, so a page
 * can be rebuilt from this record and the effects pack alone. The two HTML
 * tags the definitions use become Markdown here, so the fields validate as
 * ordinary prose.
 */
const SUMMARY_DEFINITIONS_MODULE = "src/features/psychoactive-summaries/summaryDefinitions.ts";

function htmlToMarkdown(html) {
  return String(html ?? "")
    .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
    .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
    .replace(/\s*<br\s*\/?>\s*<br\s*\/?>\s*/g, "\n\n")
    .replace(/\s*<br\s*\/?>\s*/g, "\n")
    .trim();
}

function selectSummaryEffects(effects, selection) {
  if (selection.type === "names") {
    return selection.names.flatMap((name) => {
      const effect = effects.find((candidate) => String(candidate.name).toLowerCase() === name.toLowerCase());
      return effect ? [effect] : [];
    });
  }
  return effects.filter((effect) => {
    const tags = Array.isArray(effect.tags) ? effect.tags : [];
    return selection.tags.every((tag) => tags.includes(tag)) && !(selection.excludeTags ?? []).some((tag) => tags.includes(tag));
  });
}

const SUMMARY_CORPUS = {
  id: "summaries",
  label: "Psychoactive summaries",
  dataset: "PsychoactiveSummaries",
  itemKey: "key",
  defaultSource: SUMMARY_DEFINITIONS_MODULE,
  load: async (source) => {
    const origin = source ?? SUMMARY_DEFINITIONS_MODULE;
    const absolute = path.resolve(repoRoot(), origin);
    if (absolute.endsWith(".json")) {
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    // Section membership mirrors the live loader (lib/next/routeLoaders.substances.tsx).
    // Only the batch CLI takes this branch; the bundlers must not try to resolve the path.
    const { PSYCHOACTIVE_SUMMARY_DEFINITIONS } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ absolute);
    const { dataset: effectIndex } = await openDataLoader("EffectIndex")();
    const publicEffects = Array.isArray(effectIndex.items) ? effectIndex.items : [];
    const items = PSYCHOACTIVE_SUMMARY_DEFINITIONS.map((definition) => ({
      key: definition.key,
      slug: definition.key,
      path: definition.path,
      title: definition.title,
      metadataTitle: definition.metadataTitle,
      metadataDescription: definition.metadataDescription,
      icon: definition.icon,
      image: definition.image ? { title: definition.image.title, artist: definition.image.artist } : null,
      intro: definition.intro.map((paragraph) => ({ text: htmlToMarkdown(paragraph.html), italic: Boolean(paragraph.italic) })),
      sections: definition.sections.map((section) => ({
        title: section.title,
        definition: htmlToMarkdown(section.definitionHtml),
        effectSlugs: selectSummaryEffects(publicEffects, section.selection).map((effect) => String(effect.slug)),
      })),
      seeAlso: (definition.seeAlso ?? []).map((entry) => ({ href: entry.href, label: entry.label })),
    }));
    return { dataset: envelope("PsychoactiveSummaries", items, `${SUMMARY_DEFINITIONS_MODULE} + ${OPEN_DATA}/EffectIndex.json`), origin: absolute };
  },
  excludedGroups: Object.freeze(["key", "slug", "path", "icon"]),
  excludedKeys: Object.freeze(["key", "slug", "path", "icon", "effectSlugs", "href", "artist", "italic"]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

/**
 * The 26 effect categories: each a slug, a name, a one-paragraph definition
 * and the effects it contains, resolved by the same tag rules the category
 * pages use (`src/data/effectCategoryDefinitions.ts`). The definition text is
 * the copy block when one exists, else the checked-in description, which is
 * how the category page itself picks it. Packed inside the effects dataset.
 */
const EFFECT_CATEGORY_MODULE = "src/data/effectCategoryDefinitions.ts";

const EFFECT_CATEGORY_CORPUS = {
  id: "effectCategories",
  label: "Effect categories",
  dataset: "EffectCategories",
  itemKey: "slug",
  defaultSource: EFFECT_CATEGORY_MODULE,
  load: async (source) => {
    const origin = source ?? EFFECT_CATEGORY_MODULE;
    const absolute = path.resolve(repoRoot(), origin);
    if (absolute.endsWith(".json")) {
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    const { EFFECT_CATEGORY_DEFINITIONS, effectMatchesCategorySlug } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ absolute);
    const copyBlocks = JSON.parse(await readFile(path.resolve(repoRoot(), "content/copy-blocks/copyBlocks.json"), "utf8"));
    const copyByKey = new Map(copyBlocks.map((block) => [block.key, block.body]));
    const { dataset: effectIndex } = await openDataLoader("EffectIndex")();
    const effects = Array.isArray(effectIndex.items) ? effectIndex.items : [];
    const items = EFFECT_CATEGORY_DEFINITIONS.map((definition) => ({
      slug: definition.slug,
      name: definition.name,
      description: copyByKey.get(`effects-category-${definition.slug}`) ?? definition.description,
      icon: definition.icon,
      effectSlugs: effects
        .filter((effect) => effectMatchesCategorySlug({ tags: Array.isArray(effect.tags) ? effect.tags : [] }, definition.slug))
        .map((effect) => String(effect.slug)),
    }));
    return { dataset: envelope("EffectCategories", items, `${EFFECT_CATEGORY_MODULE} + ${OPEN_DATA}/EffectIndex.json`), origin: absolute };
  },
  excludedGroups: Object.freeze(["slug", "icon", "effectSlugs"]),
  excludedKeys: Object.freeze(["slug", "icon", "effectSlugs"]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

/**
 * The drug-class safety banners. Five presets carry reader-facing text
 * (severity word, headline, one or more mechanism lines); the citation-overhaul
 * notices are site maintenance about the live audit and never leave the site,
 * so they are dropped at load rather than translated. `enabledSlugs` is the
 * membership list a renderer joins on and `icon`/`tone`/`key` are machine
 * fields, so all four travel untouched.
 */
const BANNER_CORPUS = {
  id: "banners",
  label: "Safety banners",
  dataset: "WarningBanners",
  itemKey: "key",
  defaultSource: "data:warningBanners:listPresets",
  load: async (source) => {
    const origin = source ?? "data:warningBanners:listPresets";
    if (!origin.startsWith("data:")) {
      const absolute = path.resolve(repoRoot(), origin);
      return { dataset: JSON.parse(await readFile(absolute, "utf8")), origin: absolute };
    }
    const rows = await postgresQuery("warningBanners:listPresets");
    const items = rows
      .filter((row) => row.enabled && !String(row.key).startsWith("citation-system-overhaul"))
      .map(({ _id: _identifier, _creationTime: _created, updatedAt: _updatedAt, ...rest }) => rest)
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));
    return { dataset: envelope("WarningBanners", items, `Postgres warningBanners:listPresets`), origin };
  },
  excludedGroups: Object.freeze([]),
  excludedKeys: Object.freeze(["key", "icon", "tone", "enabled", "enabledSlugs"]),
  conditionalKeys: Object.freeze({}),
  safetyGroups: Object.freeze([]),
  markupFields: Object.freeze({}),
};

export const CORPORA = Object.freeze({
  substances: SUBSTANCE_CORPUS,
  effects: EFFECT_CORPUS,
  articles: ARTICLE_CORPUS,
  reports: REPORT_CORPUS,
  replications: REPLICATION_CORPUS,
  copy: COPY_CORPUS,
  layout: LAYOUT_CORPUS,
  summaries: SUMMARY_CORPUS,
  effectCategories: EFFECT_CATEGORY_CORPUS,
  banners: BANNER_CORPUS,
});

export function resolveCorpus(id) {
  const corpus = CORPORA[id];
  if (!corpus) {
    throw new Error(`Unknown corpus ${id}. Known: ${Object.keys(CORPORA).join(", ")}`);
  }
  return corpus;
}

export { postgresQuery };
