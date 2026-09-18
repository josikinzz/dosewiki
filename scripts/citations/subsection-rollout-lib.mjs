// Subsection-scoped citation rollout: live audit + tracker seeding.
//
// Pure library shared by scripts/citations/audit-subsection-citations.mjs
// (step 1: refreshed public-only audit) and
// scripts/citations/seed-subsection-rollout-tracker.mjs (step 2: one
// slug+section rollout tracker). See
// notes-and-plans/plans/subsection-citation-rollout-seam-map.md.

import { createHash } from "node:crypto";

import { CITABLE_ARTICLE_SECTIONS } from "./citation-marker-workflow.mjs";
import {
  collectCitationMarkersFromValue,
  stripCitationMarkersFromValue,
} from "./citation-only-validator.mjs";

const SUBSECTION_AUDIT_SCHEMA = "dosewiki_subsection_citation_audit_v1";
export const SUBSECTION_TRACKER_SCHEMA = "dosewiki_subsection_rollout_v1";
export const CITABLE_SECTIONS = CITABLE_ARTICLE_SECTIONS;
export const VIABILITY_FLOOR_CHARS = 40;
export const TRACKER_STATUSES = [
  "ready",
  "researching",
  "needs_source",
  "needs_review",
  "applied",
  "verified",
  "excluded",
];
const TRACKER_STATUS_LEGEND = {
  ready: "viable uncited subsection; eligible for a scoped citation run",
  researching: "a scoped citation run is in flight for this subsection",
  needs_source: "no defensible non-wiki evidence found; do not force citations",
  needs_review: "draft produced; awaiting human review before apply",
  applied: "reviewed draft written to production; awaiting post-apply verification",
  verified: "production rendering verified; audit count may decrease",
  excluded: "intentionally outside the approved rollout scope; never select for a citation run",
};

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function textLength(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + textLength(item), 0);
  if (isPlainRecord(value)) return Object.values(value).reduce((total, item) => total + textLength(item), 0);
  return 0;
}

export function sectionMetrics(sectionValue) {
  const value = sectionValue ?? null;
  const markers = value === null ? [] : collectCitationMarkersFromValue(value, "section");
  const stripped = value === null ? null : stripCitationMarkersFromValue(value);
  return {
    chars: textLength(stripped),
    markerCount: markers.length,
    contentHash: createHash("sha256").update(stableStringify(value)).digest("hex"),
  };
}

export function classifyCoverage({ markerCount, referenceCount }) {
  if (markerCount > 0) return "inline";
  if (referenceCount > 0) return "legacy_bibliography";
  return "uncited";
}

export function publicSlugsFromLayout(layout) {
  const slugs = [];
  const seen = new Set();
  const push = (slug) => {
    if (typeof slug !== "string" || !slug || seen.has(slug)) return;
    seen.add(slug);
    slugs.push(slug);
  };
  for (const category of layout?.categories ?? []) {
    for (const section of category?.sections ?? []) {
      for (const slug of section?.drugs ?? []) push(slug);
    }
    for (const slug of category?.drugs ?? []) push(slug);
  }
  return slugs;
}

function evidenceCountsBySection(evidenceRows) {
  const counts = new Map();
  for (const row of evidenceRows ?? []) {
    const section = typeof row?.section === "string" ? row.section : "";
    if (!section) continue;
    const entry = counts.get(section) ?? {};
    entry[row.status] = (entry[row.status] ?? 0) + 1;
    counts.set(section, entry);
  }
  return counts;
}

export function buildSubsectionAudit({
  articles,
  layout,
  cohortSlugs = [],
  queueItems = [],
  evidenceBySlug = {},
  generatedAt,
  source = {},
}) {
  const layoutSlugs = publicSlugsFromLayout(layout);
  const layoutSet = new Set(layoutSlugs);
  const articlesBySlug = new Map(
    (articles ?? [])
      .filter((article) => article?.slug && layoutSet.has(article.slug))
      .map((article) => [article.slug, article]),
  );
  const queueStatusBySlug = new Map(
    (queueItems ?? [])
      .filter((item) => item?.drugSlug)
      .map((item) => [item.drugSlug, item.status ?? null]),
  );
  const cohort = [...new Set(cohortSlugs)].filter((slug) => articlesBySlug.has(slug));

  const auditedArticles = [];
  for (const slug of layoutSlugs) {
    const article = articlesBySlug.get(slug);
    if (!article) continue;
    const referenceCount = Array.isArray(article.references) ? article.references.length : 0;
    const evidenceCounts = evidenceBySlug[slug] ? evidenceCountsBySection(evidenceBySlug[slug]) : null;
    const sections = {};
    for (const section of CITABLE_SECTIONS) {
      const metrics = sectionMetrics(article[section]);
      sections[section] = {
        ...metrics,
        coverageForm: classifyCoverage({ markerCount: metrics.markerCount, referenceCount }),
        viable: metrics.chars >= VIABILITY_FLOOR_CHARS,
        evidence: evidenceCounts ? (evidenceCounts.get(section) ?? {}) : null,
      };
    }
    auditedArticles.push({
      slug,
      title: article.title ?? null,
      inCohort: cohort.includes(slug),
      queueStatus: queueStatusBySlug.get(slug) ?? null,
      referenceCount,
      sections,
    });
  }

  const isGap = (entry) => entry.viable && entry.coverageForm !== "inline";
  const viableGaps = auditedArticles.reduce((total, article) => (
    total + CITABLE_SECTIONS.filter((section) => isGap(article.sections[section])).length
  ), 0);
  const cohortViableGaps = auditedArticles
    .filter((article) => article.inCohort)
    .reduce((total, article) => (
      total + CITABLE_SECTIONS.filter((section) => isGap(article.sections[section])).length
    ), 0);

  return {
    schemaVersion: SUBSECTION_AUDIT_SCHEMA,
    generatedAt,
    source: { publicScope: "categoryLayout", ...source },
    viabilityFloorChars: VIABILITY_FLOOR_CHARS,
    sections: [...CITABLE_SECTIONS],
    cohortSlugs: cohort,
    totals: {
      publicArticles: auditedArticles.length,
      missingLayoutArticles: layoutSlugs.filter((slug) => !articlesBySlug.has(slug)),
      viableGaps,
      cohortViableGaps,
      cohortArticles: cohort.length,
    },
    articles: auditedArticles,
  };
}

/**
 * Normalize an explicit selected-section allowlist: citable keys only, no
 * duplicates, non-empty. Returns an array in input order.
 */
export function normalizeSectionList(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error("selectedSections must be a non-empty array.");
  }
  const seen = new Set();
  const result = [];
  for (const section of sections) {
    if (!CITABLE_SECTIONS.includes(section)) {
      throw new Error(`selectedSections entry "${section}" is not in the citable article surface.`);
    }
    if (seen.has(section)) {
      throw new Error(`selectedSections contains duplicate entry "${section}".`);
    }
    seen.add(section);
    result.push(section);
  }
  return result;
}

/**
 * Frozen per-section scope metadata for a scoped workbench task export.
 *
 * `strippedSections` are the marker-stripped citable sections written into the
 * task file; `contentHash` is computed over them so preflight can re-hash the
 * task file and detect drift. (The rollout tracker's originalContentHash
 * instead covers the live value including markers; for uncited gap sections
 * the two are identical.) Marker counts and coverage forms come from the
 * original (pre-strip) live content. Non-selected sections get an explicit
 * skipReason: "empty", "already_cited", or "not_selected".
 */
export function buildExportScope({
  originalSections,
  strippedSections,
  selectedSections,
  referenceCount = 0,
  source,
  trackerPath = null,
  frozenAt,
}) {
  const selected = normalizeSectionList(selectedSections);
  const selectedSet = new Set(selected);
  const sections = {};
  for (const section of CITABLE_SECTIONS) {
    const original = originalSections?.[section] ?? null;
    const stripped = strippedSections?.[section] ?? null;
    const liveMetrics = sectionMetrics(original);
    const frozenMetrics = sectionMetrics(stripped);
    const coverageForm = classifyCoverage({
      markerCount: liveMetrics.markerCount,
      referenceCount,
    });
    const isSelected = selectedSet.has(section);
    if (isSelected && frozenMetrics.chars === 0) {
      throw new Error(`Selected section "${section}" is empty in the exported task surface.`);
    }
    sections[section] = {
      selected: isSelected,
      skipReason: isSelected
        ? null
        : frozenMetrics.chars === 0
          ? "empty"
          : coverageForm === "inline"
            ? "already_cited"
            : "not_selected",
      chars: liveMetrics.chars,
      markerCount: liveMetrics.markerCount,
      contentHash: frozenMetrics.contentHash,
      coverageForm,
    };
  }
  return {
    selectedSections: selected,
    sectionScope: {
      source,
      ...(trackerPath ? { trackerPath } : {}),
      frozenAt,
      sections,
    },
  };
}

/**
 * Derive a run's selected sections from the subsection rollout tracker: the
 * sections of rows for `slug` whose status is `ready` or `researching` (a row
 * claimed by an in-flight run must still export into that run's scope), in
 * tracker order.
 */
export function selectedSectionsFromTracker(tracker, slug) {
  const rows = (tracker?.items ?? []).filter(
    (item) => item.slug === slug && (item.status === "ready" || item.status === "researching"),
  );
  if (rows.length === 0) {
    throw new Error(`No ready subsection rows for "${slug}" in the rollout tracker.`);
  }
  return normalizeSectionList(rows.map((row) => row.section));
}

export function seedSubsectionTracker({
  audit,
  existingTracker = null,
  seededAt,
  scope = "cohort",
}) {
  if (audit?.schemaVersion !== SUBSECTION_AUDIT_SCHEMA) {
    throw new Error("seedSubsectionTracker requires a subsection citation audit ledger.");
  }
  if (existingTracker && existingTracker.schemaVersion !== SUBSECTION_TRACKER_SCHEMA) {
    throw new Error(`Existing tracker has unsupported schema: ${existingTracker.schemaVersion}`);
  }
  if (!["cohort", "public"].includes(scope)) {
    throw new Error(`Unsupported subsection tracker scope "${scope}".`);
  }

  const existingItems = new Map(
    (existingTracker?.items ?? []).map((item) => [`${item.slug}:${item.section}`, item]),
  );
  const scopedArticles = scope === "public"
    ? audit.articles
    : audit.articles.filter((article) => article.inCohort);
  const gapKeys = new Set();
  const items = [];
  const skipped = [];

  for (const article of scopedArticles) {
    for (const section of CITABLE_SECTIONS) {
      const entry = article.sections[section];
      const key = `${article.slug}:${section}`;
      if (entry.coverageForm === "inline" || !entry.viable) {
        if (existingItems.has(key)) {
          // Existing rollout item resolved outside the tracker: keep it
          // unchanged and report it as no longer a gap; never silently drop it.
          items.push(existingItems.get(key));
        } else {
          skipped.push({
            slug: article.slug,
            section,
            reason: entry.coverageForm === "inline" ? "skipped_already_cited" : "skipped_empty",
            chars: entry.chars,
            markerCount: entry.markerCount,
            contentHash: entry.contentHash,
          });
        }
        continue;
      }
      gapKeys.add(key);
      const existing = existingItems.get(key);
      if (existing) {
        const drift = existing.originalContentHash !== entry.contentHash
          ? { detectedAt: seededAt, liveContentHash: entry.contentHash }
          : (existing.drift ?? undefined);
        items.push({ ...existing, ...(drift ? { drift } : {}), updatedAt: existing.updatedAt ?? seededAt });
        continue;
      }
      items.push({
        slug: article.slug,
        section,
        status: "ready",
        chars: entry.chars,
        markerCount: entry.markerCount,
        originalContentHash: entry.contentHash,
        coverageForm: entry.coverageForm,
        queueStatus: article.queueStatus,
        addedAt: seededAt,
        updatedAt: seededAt,
      });
    }
  }

  const report = {
    added: 0,
    preserved: 0,
    drifted: [],
    noLongerGaps: [],
  };
  for (const item of items) {
    const key = `${item.slug}:${item.section}`;
    if (existingItems.has(key)) {
      report.preserved += 1;
      if (item.drift && item.drift.detectedAt === seededAt) report.drifted.push(key);
    } else {
      report.added += 1;
    }
  }
  for (const key of existingItems.keys()) {
    if (!gapKeys.has(key)) report.noLongerGaps.push(key);
  }

  const tracker = {
    schemaVersion: SUBSECTION_TRACKER_SCHEMA,
    updatedAt: seededAt,
    sourceAudit: { generatedAt: audit.generatedAt },
    statusLegend: TRACKER_STATUS_LEGEND,
    viabilityFloorChars: audit.viabilityFloorChars,
    items,
    skipped,
  };
  return { tracker, report };
}
