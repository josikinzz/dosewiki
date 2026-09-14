import { normalizeRouteName } from "../../lib/article/normalization.mjs";


const DEFAULT_SECTIONS = Object.freeze(["dosage", "duration"])
const DEFAULT_DIRECTION = "both"
const VALID_REFERENCE_TEMPLATES = new Set([
  "cite_journal",
  "cite_book",
  "cite_web",
  "cite_report",
  "cite_database",
  "unknown",
]);

const DIRECTION_PAIRS = Object.freeze({
  both: [
    ["Insufflated", "Rectal"],
    ["Rectal", "Insufflated"],
  ],
  "insufflated-to-rectal": [["Insufflated", "Rectal"]],
  "rectal-to-insufflated": [["Rectal", "Insufflated"]],
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeEffectsArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { name: entry, description: "" };
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = getString(entry.name);
      if (!name) {
        return null;
      }

      return {
        name,
        description: getString(entry.description),
      };
    })
    .filter(Boolean);
}

function getEffectCategory(value) {
  if (Array.isArray(value)) {
    const effects = normalizeEffectsArray(value);
    return effects.length > 0 ? { General: { note: "", effects } } : {};
  }

  if (!isRecord(value)) {
    return {};
  }

  const category = {};
  for (const [subcategory, subcategoryData] of Object.entries(value)) {
    if (isRecord(subcategoryData) && "effects" in subcategoryData) {
      const effects = normalizeEffectsArray(subcategoryData.effects);
      const note = getString(subcategoryData.note);
      if (effects.length > 0 || note) {
        category[subcategory] = { note, effects };
      }
      continue;
    }

    if (Array.isArray(subcategoryData)) {
      const effects = normalizeEffectsArray(subcategoryData);
      if (effects.length > 0) {
        category[subcategory] = { note: "", effects };
      }
    }
  }

  return category;
}

function getSenseCategory(value) {
  if (Array.isArray(value)) {
    return {
      note: "",
      subcategories: getEffectCategory(value),
    };
  }

  if (!isRecord(value)) {
    return {
      note: "",
      subcategories: {},
    };
  }

  if ("subcategories" in value) {
    return {
      note: getString(value.note),
      subcategories: getEffectCategory(value.subcategories),
    };
  }

  return {
    note: getString(value.note),
    subcategories: getEffectCategory(value),
  };
}

function hasLegacySubjectiveEffects(subjectiveEffects) {
  if (!isRecord(subjectiveEffects)) {
    return false;
  }

  const sensory = isRecord(subjectiveEffects.sensory) ? subjectiveEffects.sensory : {};
  return (
    Array.isArray(subjectiveEffects.cognitive) ||
    Array.isArray(subjectiveEffects.physical) ||
    ["visual", "auditory", "tactile", "olfactory", "gustatory", "multisensory"].some((sense) =>
      Array.isArray(sensory[sense]),
    )
  );
}

function normalizeSubjectiveEffectsForSave(subjectiveEffects) {
  if (!hasLegacySubjectiveEffects(subjectiveEffects)) {
    return subjectiveEffects;
  }

  const notes = isRecord(subjectiveEffects.notes) ? subjectiveEffects.notes : {};
  const sensory = isRecord(subjectiveEffects.sensory) ? subjectiveEffects.sensory : {};
  const normalized = {
    notes: {
      overview: getString(notes.overview),
      sensory: getString(notes.sensory),
      cognitive: getString(notes.cognitive),
      physical: getString(notes.physical),
    },
    sensory: {
      visual: getSenseCategory(sensory.visual),
      auditory: getSenseCategory(sensory.auditory),
      tactile: getSenseCategory(sensory.tactile),
      olfactory: getSenseCategory(sensory.olfactory),
      gustatory: getSenseCategory(sensory.gustatory),
      multisensory: getSenseCategory(sensory.multisensory),
    },
    cognitive: getEffectCategory(subjectiveEffects.cognitive),
    physical: getEffectCategory(subjectiveEffects.physical),
  };

  if (subjectiveEffects.progressive_stages) {
    normalized.progressive_stages = getEffectCategory(subjectiveEffects.progressive_stages);
  }

  if (isRecord(subjectiveEffects.attribution)) {
    normalized.attribution = {
      author: getString(subjectiveEffects.attribution.author),
      text: getString(subjectiveEffects.attribution.text),
      url: getString(subjectiveEffects.attribution.url),
    };
  }

  return normalized;
}

export function normalizeArticleForRouteEquivalenceSave(article) {
  const nextArticle = cloneJson(article);

  if (Array.isArray(nextArticle.references)) {
    nextArticle.references = nextArticle.references.map((reference) => {
      if (!isRecord(reference) || !reference.template || VALID_REFERENCE_TEMPLATES.has(reference.template)) {
        return reference;
      }

      return {
        ...reference,
        template: "unknown",
      };
    });
  }

  if (nextArticle.subjective_effects) {
    nextArticle.subjective_effects = normalizeSubjectiveEffectsForSave(nextArticle.subjective_effects);
  }

  return nextArticle;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function doseRangeHasValue(range) {
  return Boolean(range && typeof range === "object" && (isFiniteNumber(range.min) || isFiniteNumber(range.max)));
}

function durationStageHasValue(stage) {
  return Boolean(stage && typeof stage === "object" && (isFiniteNumber(stage.min) || isFiniteNumber(stage.max)));
}

function dosageRouteHasValues(route) { return Boolean(
  route?.dose_ranges &&
    typeof route.dose_ranges === "object" &&
    Object.values(route.dose_ranges).some(doseRangeHasValue),
); }

function durationRouteHasValues(route) { return Boolean(
  route?.stages &&
    typeof route.stages === "object" &&
    Object.values(route.stages).some(durationStageHasValue),
); }

function routeHasValues(section, route) {
  return section === "dosage" ? dosageRouteHasValues(route) : durationRouteHasValues(route);
}

function sectionRoutes(article, section) {
  const routes = article?.[section]?.routes;
  return Array.isArray(routes) ? routes : [];
}

function normalizedRouteMatches(route, routeName) {
  return normalizeRouteName(route?.route ?? "") === routeName;
}

function findRoute(routes, routeName, { requireValues = false, section } = {}) {
  return routes.find((route) => {
    if (!normalizedRouteMatches(route, routeName)) {
      return false;
    }
    return !requireValues || routeHasValues(section, route);
  });
}

function findRouteIndex(routes, routeName) {
  return routes.findIndex((route) => normalizedRouteMatches(route, routeName));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function buildReferenceIds(sourceRoute, targetRoute, { copyReferenceIds }) {
  const targetReferenceIds = Array.isArray(targetRoute?.reference_ids) ? targetRoute.reference_ids : [];
  if (!copyReferenceIds) {
    return uniqueStrings(targetReferenceIds);
  }

  const sourceReferenceIds = Array.isArray(sourceRoute?.reference_ids) ? sourceRoute.reference_ids : [];
  return uniqueStrings([...targetReferenceIds, ...sourceReferenceIds]);
}

function withReferenceIds(route, referenceIds) {
  if (referenceIds.length === 0) {
    return route;
  }
  return {
    ...route,
    reference_ids: referenceIds,
  };
}

function buildDosageRoute({ sourceRoute, targetRoute, targetRouteName, copyReferenceIds }) {
  return withReferenceIds(
    {
      route: targetRouteName,
      bioavailability: typeof targetRoute?.bioavailability === "string" ? targetRoute.bioavailability : "",
      bioavailability_notes:
        typeof targetRoute?.bioavailability_notes === "string" ? targetRoute.bioavailability_notes : "",
      dose_ranges: cloneJson(sourceRoute.dose_ranges),
      notes: typeof targetRoute?.notes === "string" ? targetRoute.notes : "",
    },
    buildReferenceIds(sourceRoute, targetRoute, { copyReferenceIds }),
  );
}

function buildDurationRoute({ sourceRoute, targetRoute, targetRouteName, copyReferenceIds }) {
  return withReferenceIds(
    {
      route: targetRouteName,
      half_life: typeof targetRoute?.half_life === "string" ? targetRoute.half_life : "",
      half_life_notes: typeof targetRoute?.half_life_notes === "string" ? targetRoute.half_life_notes : "",
      stages: cloneJson(sourceRoute.stages),
    },
    buildReferenceIds(sourceRoute, targetRoute, { copyReferenceIds }),
  );
}

function buildRoute({ section, sourceRoute, targetRoute, targetRouteName, copyReferenceIds }) {
  if (section === "dosage") {
    return buildDosageRoute({ sourceRoute, targetRoute, targetRouteName, copyReferenceIds });
  }
  return buildDurationRoute({ sourceRoute, targetRoute, targetRouteName, copyReferenceIds });
}

function summarizeRange(range) {
  if (!range || typeof range !== "object") {
    return null;
  }
  return {
    min: range.min ?? null,
    max: range.max ?? null,
    unit: range.unit ?? "",
  };
}

function summarizeRoute(section, route) {
  if (!route) {
    return null;
  }

  if (section === "dosage") {
    return {
      route: route.route,
      dose_ranges: Object.fromEntries(
        Object.entries(route.dose_ranges ?? {}).map(([key, value]) => [key, summarizeRange(value)]),
      ),
      bioavailability: route.bioavailability ?? "",
      hasNotes: typeof route.notes === "string" && route.notes.trim().length > 0,
      reference_ids: Array.isArray(route.reference_ids) ? route.reference_ids : [],
    };
  }

  return {
    route: route.route,
    stages: Object.fromEntries(
      Object.entries(route.stages ?? {}).map(([key, value]) => [key, summarizeRange(value)]),
    ),
    half_life: route.half_life ?? "",
    reference_ids: Array.isArray(route.reference_ids) ? route.reference_ids : [],
  };
}

function copiedFieldsForSection(section) {
  return section === "dosage" ? ["dose_ranges"] : ["stages"];
}

function complementSection(section) {
  return section === "dosage" ? "duration" : "dosage";
}

function articleSlug(article) {
  return article?.slug || String(article?.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildCandidate({
  article,
  section,
  sourceRouteName,
  targetRouteName,
  sourceRoute,
  targetRoute,
  copyReferenceIds,
}) {
  const action = targetRoute ? "replace-shell-route" : "add-route";
  const newRoute = buildRoute({
    section,
    sourceRoute,
    targetRoute,
    targetRouteName,
    copyReferenceIds,
  });

  return {
    slug: articleSlug(article),
    title: article.title ?? article.name ?? articleSlug(article),
    section,
    sourceRoute: sourceRouteName,
    targetRoute: targetRouteName,
    action,
    path: `${section}.routes[route=${targetRouteName}]`,
    sourcePath: `${section}.routes[route=${sourceRouteName}]`,
    requiresExistingPath: `${complementSection(section)}.routes[route=${targetRouteName}]`,
    copiedFields: copiedFieldsForSection(section),
    copiedReferenceIds: copyReferenceIds,
    before: summarizeRoute(section, targetRoute),
    after: summarizeRoute(section, newRoute),
    newRoute,
  };
}

function summarizePlan(candidates, skipped, totalArticles) {
  const bySection = {};
  const byAction = {};
  const byDirection = {};
  const skippedByReason = {};

  for (const candidate of candidates) {
    bySection[candidate.section] = (bySection[candidate.section] ?? 0) + 1;
    byAction[candidate.action] = (byAction[candidate.action] ?? 0) + 1;
    const direction = `${candidate.sourceRoute}->${candidate.targetRoute}`;
    byDirection[direction] = (byDirection[direction] ?? 0) + 1;
  }

  for (const item of skipped) {
    skippedByReason[item.reason] = (skippedByReason[item.reason] ?? 0) + 1;
  }

  return {
    totalArticles,
    candidateCount: candidates.length,
    affectedArticleCount: new Set(candidates.map((candidate) => candidate.slug)).size,
    skippedCount: skipped.length,
    bySection,
    byAction,
    byDirection,
    skippedByReason,
  };
}

export function normalizeSections(sections = DEFAULT_SECTIONS) {
  const values = Array.isArray(sections) ? sections : String(sections).split(",");
  const normalized = values.map((section) => String(section).trim()).filter(Boolean);
  const invalid = normalized.filter((section) => !DEFAULT_SECTIONS.includes(section));
  if (invalid.length > 0) {
    throw new Error(`Invalid section(s): ${invalid.join(", ")}. Expected dosage, duration, or both.`);
  }
  return [...new Set(normalized)];
}

export function normalizeDirection(direction = DEFAULT_DIRECTION) {
  if (!DIRECTION_PAIRS[direction]) {
    throw new Error(
      `Invalid direction: ${direction}. Expected one of: ${Object.keys(DIRECTION_PAIRS).join(", ")}`,
    );
  }
  return direction;
}

export function buildRouteEquivalenceFillPlan(articles, options = {}) {
  const direction = normalizeDirection(options.direction ?? DEFAULT_DIRECTION);
  const sections = normalizeSections(options.sections ?? DEFAULT_SECTIONS);
  const copyReferenceIds = options.copyReferenceIds === true;
  const selectedSlugs = options.slugs?.length ? new Set(options.slugs.map(String)) : null;
  const candidates = [];
  const skipped = [];
  const scopedArticles = selectedSlugs
    ? articles.filter((article) => selectedSlugs.has(articleSlug(article)))
    : articles;

  for (const article of scopedArticles) {
    const slug = articleSlug(article);

    for (const [sourceRouteName, targetRouteName] of DIRECTION_PAIRS[direction]) {
      for (const section of sections) {
        const targetComplementSection = complementSection(section);
        const sectionRouteList = sectionRoutes(article, section);
        const complementRouteList = sectionRoutes(article, targetComplementSection);
        const sourceRoute = findRoute(sectionRouteList, sourceRouteName, {
          requireValues: true,
          section,
        });
        const targetRouteWithValues = findRoute(sectionRouteList, targetRouteName, {
          requireValues: true,
          section,
        });
        const targetRoute = findRoute(sectionRouteList, targetRouteName, {
          requireValues: false,
          section,
        });
        const targetComplementRoute = findRoute(complementRouteList, targetRouteName, {
          requireValues: true,
          section: targetComplementSection,
        });

        if (!sourceRoute) {
          continue;
        }

        if (targetRouteWithValues) {
          continue;
        }

        if (!targetComplementRoute) {
          skipped.push({
            slug,
            title: article.title ?? article.name ?? slug,
            section,
            sourceRoute: sourceRouteName,
            targetRoute: targetRouteName,
            path: `${section}.routes[route=${targetRouteName}]`,
            reason: "target-route-not-established",
            requiredPath: `${targetComplementSection}.routes[route=${targetRouteName}]`,
          });
          continue;
        }

        candidates.push(
          buildCandidate({
            article,
            section,
            sourceRouteName,
            targetRouteName,
            sourceRoute,
            targetRoute,
            copyReferenceIds,
          }),
        );
      }
    }
  }

  candidates.sort((a, b) => {
    const titleCompare = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (titleCompare !== 0) return titleCompare;
    return a.path.localeCompare(b.path);
  });

  skipped.sort((a, b) => {
    const titleCompare = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (titleCompare !== 0) return titleCompare;
    return a.path.localeCompare(b.path);
  });

  return {
    options: {
      direction,
      sections,
      copyReferenceIds,
      slugs: selectedSlugs ? [...selectedSlugs].sort() : null,
      requiresEstablishedTargetRoute: true,
    },
    summary: summarizePlan(candidates, skipped, scopedArticles.length),
    candidates,
    skipped,
  };
}

function applyCandidate(article, candidate) {
  const routes = Array.isArray(article?.[candidate.section]?.routes)
    ? article[candidate.section].routes
    : [];
  const nextRoute = cloneJson(candidate.newRoute);
  const targetIndex = findRouteIndex(routes, candidate.targetRoute);

  if (!article[candidate.section] || typeof article[candidate.section] !== "object") {
    article[candidate.section] = { routes: [] };
  }

  if (!Array.isArray(article[candidate.section].routes)) {
    article[candidate.section].routes = [];
  }

  if (targetIndex >= 0) {
    article[candidate.section].routes[targetIndex] = nextRoute;
  } else {
    article[candidate.section].routes.push(nextRoute);
  }

  return article;
}

export function applyRouteEquivalenceFillPlan(articles, plan) {
  const candidatesBySlug = new Map();
  for (const candidate of plan.candidates) {
    const list = candidatesBySlug.get(candidate.slug) ?? [];
    list.push(candidate);
    candidatesBySlug.set(candidate.slug, list);
  }

  const updatedArticles = [];
  for (const article of articles) {
    const slug = articleSlug(article);
    const candidates = candidatesBySlug.get(slug);
    if (!candidates?.length) {
      continue;
    }

    const nextArticle = cloneJson(article);
    for (const candidate of candidates) {
      applyCandidate(nextArticle, candidate);
    }
    updatedArticles.push(nextArticle);
  }

  return updatedArticles;
}

export function formatRouteEquivalencePlanMarkdown(plan) {
  const lines = [
    "# Insufflated/Rectal Route Gap Fill Plan",
    "",
    "## Summary",
    "",
    `- Candidate patches: ${plan.summary.candidateCount}`,
    `- Affected articles: ${plan.summary.affectedArticleCount}`,
    `- Skipped non-established route gaps: ${plan.summary.skippedByReason["target-route-not-established"] ?? 0}`,
    `- Sections: ${plan.options.sections.join(", ")}`,
    `- Direction: ${plan.options.direction}`,
    `- Copy reference IDs: ${plan.options.copyReferenceIds ? "yes" : "no"}`,
    "",
    "## Candidates",
    "",
  ];

  if (plan.candidates.length === 0) {
    lines.push("No candidate patches.");
  } else {
    lines.push("| Article | Section | Copy | Requires Existing | Action |");
    lines.push("|---|---|---|---|---|");
    for (const candidate of plan.candidates) {
      lines.push(
        `| ${candidate.title} (${candidate.slug}) | ${candidate.section} | ${candidate.sourceRoute} -> ${candidate.targetRoute} | ${candidate.requiresExistingPath} | ${candidate.action} |`,
      );
    }
  }

  lines.push("", "## Skipped", "");
  if (plan.skipped.length === 0) {
    lines.push("No skipped route gaps.");
  } else {
    lines.push("| Article | Section | Would Copy | Reason | Required Existing Path |");
    lines.push("|---|---|---|---|---|");
    for (const skipped of plan.skipped) {
      lines.push(
        `| ${skipped.title} (${skipped.slug}) | ${skipped.section} | ${skipped.sourceRoute} -> ${skipped.targetRoute} | ${skipped.reason} | ${skipped.requiredPath} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
