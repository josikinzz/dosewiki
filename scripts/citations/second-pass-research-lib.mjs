import { createHash } from "node:crypto";
import { assertCitationSourceIdentity } from "./citation-target-policy.mjs";
import {
  SECOND_PASS_COMPLETION_CRITERIA,
  SECOND_PASS_RESEARCH_RULES,
} from "./citation-evidence-policy.mjs";

export const SECOND_PASS_SCHEMA_VERSION = "dosewiki_citation_second_pass_plan_v1";
const SECOND_PASS_EXCLUDED_SECTIONS = Object.freeze(["tolerance"])
const SECOND_PASS_EXCLUDED_SLUGS = Object.freeze(["deschloroketamine"])

const WAVE_ORDER = Object.freeze({
  wave_1_obvious: 1,
  wave_2_strong: 2,
  wave_3_exploratory: 3,
  defer_sparse: 4,
});

const SECTION_LANES = Object.freeze({
  summary: [
    "Reuse the article's inspected reference pool for identity, class, origin, and defining claims.",
    "Search authoritative databases and peer-reviewed reviews using the canonical name plus synonyms.",
    "Inspect first reports, synthesis papers, regulator profiles, or official medicine labels for exact remaining claims.",
  ],
  pharmacology: [
    "Start with existing article references and review literature for mechanism, receptor, metabolism, and pharmacokinetic claims.",
    "Search PubMed/PMC and journal indexes by canonical name, synonyms, active metabolites or named plant constituents, and assay terms.",
    "Use primary receptor/transporter assays, human pharmacokinetic studies, or official medicine labels only where they directly support the article's exact claim.",
  ],
  harm_potential: [
    "Search clinical toxicology reviews, poison-centre series, case reports, and pharmacovigilance records for the exact harms described.",
    "Inspect WHO, EUDA, FDA, MHRA, coroner, or other regulator risk assessments where applicable.",
    "Keep broad class-level warnings uncited unless the source explicitly supports applying them to this substance or named constituent.",
  ],
  history_culture: [
    "Search first synthesis or patent records, scholarly histories, books, and institutional archives for dated claims.",
    "Use regulator or reputable contemporary reporting for market emergence and notable events.",
    "Do not infer a compound-specific history from an analogue's history.",
  ],
  legality: [
    "Search primary statutes, schedules, gazettes, and regulator databases by canonical name and known synonyms.",
    "Use UN, WHO, EUDA, DEA, or national regulator documents for international or national control claims.",
    "Treat analogue-law applicability as review-only unless an authoritative source explicitly applies it.",
  ],
});

function sourcePoolPoints(referenceCount) {
  if (referenceCount >= 25) return 4;
  if (referenceCount >= 10) return 3;
  if (referenceCount >= 4) return 2;
  if (referenceCount >= 1) return 1;
  return 0;
}

function citationPrecedentPoints(markerCount) {
  if (markerCount >= 10) return 3;
  if (markerCount >= 3) return 2;
  if (markerCount >= 1) return 1;
  return 0;
}

function sectionPoints(section) {
  return section === "summary" || section === "pharmacology" ? 2 : 1;
}

function priorityForScore(score) {
  if (score >= 9) return "wave_1_obvious";
  if (score >= 7) return "wave_2_strong";
  if (score >= 4) return "wave_3_exploratory";
  return "defer_sparse";
}

function feasibilityForPriority(priority) {
  return {
    wave_1_obvious: "high",
    wave_2_strong: "good",
    wave_3_exploratory: "uncertain",
    defer_sparse: "low",
  }[priority];
}

function signalsForCandidate({ referenceCount, articleMarkerCount, section, chars }) {
  const signals = [];
  if (referenceCount >= 25) signals.push("large_existing_reference_pool");
  else if (referenceCount >= 10) signals.push("established_reference_pool");
  else if (referenceCount >= 4) signals.push("small_but_usable_reference_pool");
  else if (referenceCount > 0) signals.push("very_sparse_reference_pool");
  else signals.push("no_existing_reference_pool");

  if (articleMarkerCount >= 10) signals.push("strong_inline_citation_precedent");
  else if (articleMarkerCount > 0) signals.push("some_inline_citation_precedent");
  else signals.push("no_inline_citation_precedent");

  if (section === "summary" || section === "pharmacology") signals.push("directly_researchable_section");
  if (chars >= 80) signals.push("substantive_public_prose");
  return signals;
}

function candidateFromAuditArticle(article, section, sectionAudit) {
  const articleMarkerCount = Object.values(article.sections ?? {})
    .reduce((sum, entry) => sum + Number(entry?.markerCount ?? 0), 0);
  const referenceCount = Number(article.referenceCount ?? 0);
  const chars = Number(sectionAudit.chars ?? 0);
  const score = sourcePoolPoints(referenceCount)
    + citationPrecedentPoints(articleMarkerCount)
    + sectionPoints(section)
    + (chars >= 80 ? 1 : 0);
  const priority = priorityForScore(score);
  return {
    section,
    status: priority === "defer_sparse" ? "deferred_sparse" : "proposed",
    feasibility: feasibilityForPriority(priority),
    priority,
    score,
    chars,
    contentHash: sectionAudit.contentHash,
    coverageForm: sectionAudit.coverageForm,
    existingReferenceCount: referenceCount,
    existingArticleMarkerCount: articleMarkerCount,
    signals: signalsForCandidate({ referenceCount, articleMarkerCount, section, chars }),
    researchLanes: SECTION_LANES[section] ?? [],
    completionCriteria: [...SECOND_PASS_COMPLETION_CRITERIA],
  };
}

function summarize(substances) {
  const candidates = substances.flatMap((entry) => entry.sections);
  const byPriority = {};
  const bySection = {};
  for (const candidate of candidates) {
    byPriority[candidate.priority] = (byPriority[candidate.priority] ?? 0) + 1;
    bySection[candidate.section] = (bySection[candidate.section] ?? 0) + 1;
  }
  return {
    substances: substances.length,
    subsectionCandidates: candidates.length,
    actionableCandidates: candidates.filter((entry) => entry.status === "proposed").length,
    deferredSparseCandidates: candidates.filter((entry) => entry.status === "deferred_sparse").length,
    byPriority,
    bySection,
  };
}

export function buildSecondPassResearchPlan(audit, { generatedAt = new Date().toISOString(), auditPath = null } = {}) {
  if (audit?.schemaVersion !== "dosewiki_subsection_citation_audit_v1") {
    throw new Error("Second-pass planning requires a dosewiki_subsection_citation_audit_v1 audit.");
  }
  assertCitationSourceIdentity(audit.source?.postgresIdentity);
  const substances = [];
  for (const article of audit.articles ?? []) {
    if (SECOND_PASS_EXCLUDED_SLUGS.includes(article.slug)) continue;
    const sections = [];
    for (const [section, sectionAudit] of Object.entries(article.sections ?? {})) {
      if (SECOND_PASS_EXCLUDED_SECTIONS.includes(section)) continue;
      if (!sectionAudit?.viable || Number(sectionAudit.markerCount ?? 0) > 0) continue;
      sections.push(candidateFromAuditArticle(article, section, sectionAudit));
    }
    if (sections.length === 0) continue;
    sections.sort((left, right) => WAVE_ORDER[left.priority] - WAVE_ORDER[right.priority] || left.section.localeCompare(right.section));
    substances.push({
      slug: article.slug,
      title: article.title ?? article.slug,
      queueStatus: article.queueStatus ?? null,
      recommendedRunId: `${article.slug}-second-pass-1`,
      highestPriority: sections[0].priority,
      sections,
    });
  }
  substances.sort((left, right) => (
    WAVE_ORDER[left.highestPriority] - WAVE_ORDER[right.highestPriority]
    || Math.max(...right.sections.map((entry) => entry.score)) - Math.max(...left.sections.map((entry) => entry.score))
    || left.slug.localeCompare(right.slug)
  ));

  const auditIdentity = createHash("sha256").update(JSON.stringify(audit)).digest("hex");
  return {
    schemaVersion: SECOND_PASS_SCHEMA_VERSION,
    generatedAt,
    source: {
      auditPath,
      auditGeneratedAt: audit.generatedAt ?? null,
      auditSha256: auditIdentity,
      postgresIdentity: audit.source.postgresIdentity,
    },
    policy: {
      objective: "Find defensible citations missed by the first pass without weakening source or quote standards.",
      excludedSections: [...SECOND_PASS_EXCLUDED_SECTIONS],
      excludedSlugs: [...SECOND_PASS_EXCLUDED_SLUGS],
      priorityThresholds: {
        wave_1_obvious: "score 9-10; source-rich article and strong citation precedent",
        wave_2_strong: "score 7-8; good source signals",
        wave_3_exploratory: "score 4-6; bounded research, often sparse or novel compounds",
        defer_sparse: "score 0-3; no meaningful source or citation precedent",
      },
      hardRules: [
        "No production writes occur during second-pass planning or research.",
        "Tolerance remains excluded by product decision.",
        "Deschloroketamine remains excluded pending article-completeness investigation.",
        ...SECOND_PASS_RESEARCH_RULES,
      ],
    },
    summary: summarize(substances),
    substances,
  };
}

export function buildSecondPassCampaignTracker(plan, { generatedAt = new Date().toISOString() } = {}) {
  if (plan?.schemaVersion !== SECOND_PASS_SCHEMA_VERSION) {
    throw new Error(`Second-pass plan must use ${SECOND_PASS_SCHEMA_VERSION}.`);
  }
  assertCitationSourceIdentity(plan.source?.postgresIdentity);
  const items = [];
  for (const substance of plan.substances ?? []) {
    for (const candidate of substance.sections ?? []) {
      const deferred = candidate.status === "deferred_sparse";
      items.push({
        slug: substance.slug,
        title: substance.title ?? substance.slug,
        section: candidate.section,
        status: deferred ? "excluded" : "ready",
        chars: candidate.chars,
        markerCount: 0,
        originalContentHash: candidate.contentHash,
        coverageForm: candidate.coverageForm,
        queueStatus: substance.queueStatus ?? null,
        researchPass: "second",
        priority: candidate.priority,
        score: candidate.score,
        recommendedRunId: substance.recommendedRunId,
        addedAt: generatedAt,
        updatedAt: generatedAt,
        ...(deferred ? {
          excludedAt: generatedAt,
          exclusionReason: "Deferred by second-pass plan because source and citation precedent are too sparse; reconsider only when new authoritative evidence appears.",
        } : {}),
      });
    }
  }
  return {
    schemaVersion: "dosewiki_subsection_rollout_v1",
    campaignKind: "citation_second_pass",
    researchPass: "second",
    createdAt: generatedAt,
    updatedAt: generatedAt,
    sourcePlan: {
      schemaVersion: plan.schemaVersion,
      generatedAt: plan.generatedAt,
      auditSha256: plan.source?.auditSha256 ?? null,
      postgresIdentity: plan.source.postgresIdentity,
    },
    statusLegend: {
      ready: "Planned and not yet started.",
      researching: "A protected local second-pass run is active.",
      needs_review: "Validated local markers are ready for human review.",
      needs_source: "All prescribed research lanes completed without a defensible marker.",
      excluded: "Deferred by the immutable second-pass plan.",
    },
    items,
    skipped: [],
  };
}

export function secondPassScopeForSlug(plan, slug, { maxWave = 3 } = {}) {
  if (plan?.schemaVersion !== SECOND_PASS_SCHEMA_VERSION) {
    throw new Error(`Second-pass plan must use ${SECOND_PASS_SCHEMA_VERSION}.`);
  }
  const substance = (plan.substances ?? []).find((entry) => entry.slug === slug);
  if (!substance) throw new Error(`Second-pass plan has no candidate rows for ${slug}.`);
  const sections = substance.sections.filter((entry) => (
    entry.status === "proposed" && WAVE_ORDER[entry.priority] <= maxWave
  ));
  if (sections.length === 0) {
    throw new Error(`Second-pass plan has no actionable rows for ${slug} at wave ${maxWave}.`);
  }
  return {
    selectedSections: sections.map((entry) => entry.section),
    researchBrief: {
      schemaVersion: SECOND_PASS_SCHEMA_VERSION,
      pass: "second",
      planGeneratedAt: plan.generatedAt,
      recommendedRunId: substance.recommendedRunId,
      candidates: sections,
      hardRules: plan.policy?.hardRules ?? [],
    },
  };
}
