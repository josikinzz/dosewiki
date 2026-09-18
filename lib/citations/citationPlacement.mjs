const CITE_TOKEN_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

const CITATION_PLACEMENT_SECTIONS = Object.freeze([
  { key: "summary", legacyKey: "summary", severity: "blocking" },
  { key: "dosage_duration", legacyKey: "dosage-duration", severity: "blocking" },
  { key: "pharmacology", legacyKey: "pharmacology", severity: "blocking" },
  { key: "harm_potential", legacyKey: "harm-potential", severity: "blocking" },
  { key: "interactions", legacyKey: "interactions", severity: "blocking" },
  { key: "identification", legacyKey: "identification", severity: "blocking" },
  { key: "legality", legacyKey: "legality", severity: "blocking" },
  { key: "history_culture", legacyKey: "history-culture", severity: "non_blocking" },
  { key: "tolerance", legacyKey: "tolerance", severity: "blocking" },
])

const SECTION_LOOKUP = new Map();
for (const section of CITATION_PLACEMENT_SECTIONS) {
  SECTION_LOOKUP.set(section.key, section);
  SECTION_LOOKUP.set(section.legacyKey, section);
}

const FORMAL_TARGET_SECTION_KEYS = new Set([
  "summary",
  "pharmacology",
  "harm_potential",
  "legality",
  "history_culture",
  "tolerance",
]);

const WORKBENCH_CLAIM_PLACEMENTS = Object.freeze([
  {
    claimKey: "use_and_effects.dose_duration",
    section: "dosage_duration",
    severity: "blocking",
    mergeMode: "structured_reference_ids",
    fieldPaths: ["dosage.routes[route=oral].reference_ids", "duration.routes[route=oral].reference_ids"],
    apply: (article, changes, evidence) => {
      const referenceIds = evidence.referenceIds ?? [];
      addRouteReferenceIds(article, changes, "dosage.routes", "oral", referenceIds);
      addRouteReferenceIds(article, changes, "duration.routes", "oral", referenceIds);
    },
  },
  {
    claimKey: "side_effects.common_adverse_effects",
    section: "harm_potential",
    severity: "blocking",
    mergeMode: "append_claim_text",
    fieldPaths: ["harm_potential.summary"],
    apply: (article, changes, evidence) => {
      upsertHarmSummary(article, changes, evidence.claimText, evidence.referenceIds ?? []);
    },
  },
  {
    claimKey: "overdose.high_dose_effects",
    section: "harm_potential",
    severity: "blocking",
    mergeMode: "append_claim_text",
    fieldPaths: ["harm_potential.summary"],
    apply: (article, changes, evidence) => {
      upsertHarmSummary(article, changes, evidence.claimText, evidence.referenceIds ?? []);
    },
  },
  {
    claimKey: "interactions.maoi_potentiation",
    section: "interactions",
    severity: "blocking",
    mergeMode: "maoi_caution_text",
    fieldPaths: ["interactions.caution"],
    apply: (article, changes, evidence) => {
      updateMaoiInteraction(article, changes, evidence.referenceIds ?? []);
    },
  },
  {
    claimKey: "pharmacology.5ht2_partial_agonist",
    section: "pharmacology",
    severity: "blocking",
    mergeMode: "inline_text",
    fieldPaths: ["pharmacology.pharmacodynamics"],
    apply: (article, changes, evidence) => {
      updateStringField(article, changes, "pharmacology.pharmacodynamics", (value) =>
        appendCitationTokens(value, evidence.referenceIds ?? []),
      );
    },
  },
  {
    claimKey: "pharmacokinetics.half_life",
    section: "pharmacology",
    severity: "blocking",
    mergeMode: "review_only",
    fieldPaths: ["pharmacology.pharmacokinetics"],
  },
  {
    claimKey: "chemistry.class_and_mescaline_analogue",
    section: "identification",
    severity: "blocking",
    mergeMode: "append_claim_text",
    fieldPaths: ["summary"],
    apply: (article, changes, evidence) => {
      updateStringField(article, changes, "summary", (value) =>
        appendSentenceWithCitations(value, evidence.claimText, evidence.referenceIds ?? []),
      );
    },
  },
  {
    claimKey: "history.shulgin_synthesis_1974",
    section: "history_culture",
    severity: "non_blocking",
    mergeMode: "history_section_citations",
    fieldPaths: ["history_culture.sections[heading=Discovery and Early Research].content"],
    apply: (article, changes, evidence) => {
      appendHistorySectionCitations(article, changes, "Discovery and Early Research", evidence.referenceIds ?? []);
    },
  },
  {
    claimKey: "society_and_culture.names",
    section: "history_culture",
    severity: "non_blocking",
    mergeMode: "history_section_citations",
    fieldPaths: ["history_culture.sections[heading=Commercial Marketing and Recreational Emergence].content"],
    apply: (article, changes, evidence) => {
      appendHistorySectionCitations(article, changes, "Commercial Marketing and Recreational Emergence", evidence.referenceIds ?? []);
    },
  },
  {
    claimKey: "society_and_culture.illicit_forms",
    section: "history_culture",
    severity: "non_blocking",
    mergeMode: "history_section_append_claim_text",
    fieldPaths: ["history_culture.sections[heading=Commercial Marketing and Recreational Emergence].content"],
    apply: (article, changes, evidence) => {
      appendHistorySectionContent(
        article,
        changes,
        "Commercial Marketing and Recreational Emergence",
        evidence.claimText,
        evidence.referenceIds ?? [],
      );
    },
  },
  {
    claimKey: "legal_status.un_and_us_scheduling",
    section: "legality",
    severity: "blocking",
    mergeMode: "split_inline_text",
    fieldPaths: ["legality.international[0]", "legality.countries.United States.notes"],
    apply: (article, changes, evidence) => {
      const referenceIds = evidence.referenceIds ?? [];
      const international = article?.legality?.international;
      if (Array.isArray(international) && international[0]) {
        const before = international[0];
        international[0] = appendCitationTokens(before, [referenceIds[0]].filter(Boolean));
        recordChange(changes, "legality.international[0]", before, international[0]);
      }
      const us = article?.legality?.countries?.["United States"];
      if (us) {
        const before = us.notes;
        us.notes = appendCitationTokens(before, [referenceIds[1] ?? referenceIds[0]].filter(Boolean));
        recordChange(changes, "legality.countries.United States.notes", before, us.notes);
      }
    },
  },
  {
    claimKey: "research.psychotherapy",
    section: "history_culture",
    severity: "non_blocking",
    mergeMode: "history_section_citations",
    fieldPaths: ["history_culture.sections[heading=Therapeutic Use].content"],
    apply: (article, changes, evidence) => {
      appendHistorySectionCitations(article, changes, "Therapeutic Use", evidence.referenceIds ?? []);
    },
  },
]);

const WORKBENCH_CLAIM_PLACEMENT_BY_KEY = new Map(
  WORKBENCH_CLAIM_PLACEMENTS.map((placement) => [placement.claimKey, placement]),
);

function normalizeCitationPlacementSectionKey(value) { if (typeof value !== "string") return null;
return SECTION_LOOKUP.get(value.trim())?.key ?? null; }

function getCitationPlacementSection(sectionKey) { const normalized = normalizeCitationPlacementSectionKey(sectionKey);
if (!normalized) {
  throw new Error(`Unknown citation placement section: ${sectionKey}`);
}
return SECTION_LOOKUP.get(normalized); }

export function getWorkbenchCitationPlacement(claimKey) {
  return WORKBENCH_CLAIM_PLACEMENT_BY_KEY.get(claimKey) ?? null;
}

export function getWorkbenchCitationSection({ claimKey, fieldPath } = {}) {
  const placement = getWorkbenchCitationPlacement(claimKey);
  return placement?.section ?? fieldPath?.split(".")[0] ?? "workbench";
}

export function getWorkbenchCitationSeverity(claimKey) {
  return getWorkbenchCitationPlacement(claimKey)?.severity ?? "blocking";
}

export function applyWorkbenchCitationPlacement(article, changes, evidence) {
  const placement = getWorkbenchCitationPlacement(evidence?.claimKey);
  if (!placement?.apply) {
    changes.push({
      path: evidence?.fieldPath,
      before: null,
      after: null,
      skipped: true,
      reason: `No adapter mapping for ${evidence?.claimKey}`,
    });
    return false;
  }

  placement.apply(article, changes, evidence);
  return true;
}

export function buildCitationPlacementTargets({ article, sectionKey }) {
  const normalized = normalizeCitationPlacementSectionKey(sectionKey);
  if (!normalized || !FORMAL_TARGET_SECTION_KEYS.has(normalized)) {
    throw new Error(`Unknown formal citation section: ${sectionKey}`);
  }

  switch (normalized) {
    case "summary":
      return [makeInlineTarget(article?.summary, normalized, "summary")].filter(Boolean);
    case "pharmacology":
      return [
        makeInlineTarget(article?.pharmacology?.pharmacodynamics, normalized, "pharmacology.pharmacodynamics"),
        makeInlineTarget(article?.pharmacology?.pharmacokinetics, normalized, "pharmacology.pharmacokinetics"),
      ].filter(Boolean);
    case "harm_potential":
      return [makeInlineTarget(article?.harm_potential?.summary, normalized, "harm_potential.summary")].filter(Boolean);
    case "history_culture":
      return [makeInlineTarget(article?.history_culture?.content, normalized, "history_culture.content")].filter(Boolean);
    case "legality":
      return Object.entries(article?.legality?.countries ?? {}).flatMap(([country, entry]) => (
        makeInlineTarget(entry?.notes, normalized, `legality.countries.${country}.notes`) ?? []
      ));
    case "tolerance":
      return Object.entries(article?.tolerance ?? {}).flatMap(([field, value]) => (
        makeInlineTarget(value, normalized, `tolerance.${field}`) ?? []
      ));
    default:
      return [];
  }
}

export function extractCitationTokens(text) {
  if (typeof text !== "string" || !text.includes("[cite:")) return [];
  return Array.from(text.matchAll(CITE_TOKEN_PATTERN), (match) => ({
    id: match[1],
    index: match.index ?? 0,
    raw: match[0],
  }));
}

export function collectCitationIdsFromPublicRenderOrder(article) {
  const record = asRecord(article);
  if (!record) {
    return typeof article === "string" ? collectCitationIdsFromContent(article) : [];
  }

  const orderedIds = [];
  const seen = new Set();

  collectCitationIdsFromText(record.summary, orderedIds, seen);
  collectDosageDurationCitationIds(record, orderedIds, seen);

  const pharmacology = asRecord(record.pharmacology) ?? {};
  const pharmacodynamicsText = typeof pharmacology.pharmacodynamics === "string" && pharmacology.pharmacodynamics.trim().length > 0
    ? pharmacology.pharmacodynamics
    : pharmacology.summary;
  collectCitationIdsFromText(pharmacodynamicsText, orderedIds, seen);
  // The binding-sites card renders under the pharmacodynamics prose, and each
  // row cites through its target/tag, affinity, and efficacy fields. Left
  // out of this walk, those ids get no number and their references never reach
  // the sources list, so the row's marker degrades to "?".
  for (const entry of asArray(pharmacology.binding_sites)) {
    const entryRecord = asRecord(entry);
    if (!entryRecord) continue;
    const mechanism = typeof entryRecord.tag === "string" && entryRecord.tag.trim().length > 0
      ? entryRecord.tag
      : entryRecord.target;
    collectCitationIdsFromText(mechanism, orderedIds, seen);
    collectCitationIdsFromText(entryRecord.affinity, orderedIds, seen);
    collectCitationIdsFromText(entryRecord.efficacy, orderedIds, seen);
  }
  collectCitationIdsFromText(pharmacology.pharmacokinetics, orderedIds, seen);
  // Same story for the metabolites card, which renders after the kinetics prose.
  for (const metabolite of asArray(pharmacology.metabolites)) {
    collectCitationIdsFromText(metabolite, orderedIds, seen);
  }

  const interactions = asRecord(record.interactions) ?? {};
  for (const key of ["dangerous", "unsafe", "caution"]) {
    for (const value of asArray(interactions[key])) {
      collectCitationIdsFromText(value, orderedIds, seen);
    }
  }

  const tolerance = asRecord(record.tolerance) ?? {};
  collectCitationIdsFromText(tolerance.full_tolerance, orderedIds, seen);
  collectCitationIdsFromText(tolerance.half_tolerance, orderedIds, seen);
  collectCitationIdsFromText(tolerance.baseline_tolerance, orderedIds, seen);
  for (const value of asArray(tolerance.cross_tolerance)) {
    collectCitationIdsFromText(value, orderedIds, seen);
  }

  const harmPotential = asRecord(record.harm_potential) ?? {};
  collectCitationIdsFromText(harmPotential.summary, orderedIds, seen);
  const addiction = asRecord(harmPotential.addiction) ?? {};
  const psychological = asRecord(addiction.psychological) ?? {};
  const physicalDependence = asRecord(addiction.physical_dependence) ?? {};
  collectCitationIdsFromText(psychological.description, orderedIds, seen);
  collectCitationIdsFromText(physicalDependence.description, orderedIds, seen);
  const toxicity = asRecord(harmPotential.toxicity) ?? {};
  const lethalDosage = asRecord(toxicity.lethal_dosage) ?? {};
  collectCitationIdsFromText(lethalDosage.notes, orderedIds, seen);
  collectCitationIdsFromText(toxicity.ld50, orderedIds, seen);
  for (const organ of asArray(toxicity.organ_toxicity)) {
    const organRecord = asRecord(organ);
    if (!organRecord) continue;
    collectCitationIdsFromText(organRecord.findings, orderedIds, seen);
    collectCitationIdsFromText(organRecord.mechanism, orderedIds, seen);
    collectCitationIdsFromText(organRecord.notes, orderedIds, seen);
  }
  collectCitationIdsFromText(toxicity.organ_toxicity, orderedIds, seen);
  const carcinogenicity = asRecord(toxicity.carcinogenicity) ?? {};
  const antibioticFunction = asRecord(toxicity.antibiotic_function) ?? {};
  collectCitationIdsFromText(carcinogenicity.description, orderedIds, seen);
  collectCitationIdsFromText(antibioticFunction.description, orderedIds, seen);
  const psychosis = asRecord(harmPotential.psychosis) ?? {};
  const seizure = asRecord(harmPotential.seizure) ?? {};
  collectCitationIdsFromText(psychosis.description, orderedIds, seen);
  collectCitationIdsFromText(seizure.description, orderedIds, seen);

  const historyCulture = asRecord(record.history_culture) ?? {};
  collectCitationIdsFromText(historyCulture.content, orderedIds, seen);
  for (const section of asArray(historyCulture.sections)) {
    const sectionRecord = asRecord(section);
    if (!sectionRecord) continue;
    collectCitationIdsFromText(sectionRecord.content, orderedIds, seen);
    for (const subsection of asArray(sectionRecord.subsections)) {
      const subsectionRecord = asRecord(subsection);
      if (!subsectionRecord) continue;
      collectCitationIdsFromText(subsectionRecord.content, orderedIds, seen);
    }
  }

  const legality = asRecord(record.legality) ?? {};
  for (const value of asArray(legality.international)) {
    collectCitationIdsFromText(value, orderedIds, seen);
  }
  const countries = asRecord(legality.countries) ?? {};
  for (const country of Object.values(countries)) {
    const countryRecord = asRecord(country);
    if (!countryRecord) continue;
    collectCitationIdsFromText(countryRecord.status, orderedIds, seen);
    collectCitationIdsFromText(countryRecord.instrument, orderedIds, seen);
    collectCitationIdsFromText(countryRecord.notes, orderedIds, seen);
  }
  collectCitationIdsFromText(legality.usStatesNote, orderedIds, seen);
  const usStates = asRecord(legality.usStates) ?? {};
  for (const state of Object.values(usStates)) {
    const stateRecord = asRecord(state);
    if (!stateRecord) continue;
    collectCitationIdsFromText(stateRecord.status, orderedIds, seen);
    collectCitationIdsFromText(stateRecord.instrument, orderedIds, seen);
    collectCitationIdsFromText(stateRecord.notes, orderedIds, seen);
    const cities = asRecord(stateRecord.cities) ?? {};
    for (const city of Object.values(cities)) {
      const cityRecord = asRecord(city);
      if (!cityRecord) continue;
      collectCitationIdsFromText(cityRecord.status, orderedIds, seen);
      collectCitationIdsFromText(cityRecord.instrument, orderedIds, seen);
      collectCitationIdsFromText(cityRecord.notes, orderedIds, seen);
    }
  }

  return orderedIds;
}

function makeInlineTarget(value, sectionKey, fieldPath) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const section = getCitationPlacementSection(sectionKey);
  return {
    sectionKey,
    claimKey: `${section.legacyKey}:${fieldPath}`,
    fieldPath,
    claimText: value.trim(),
    mergeMode: "inline_text",
  };
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function citationToken(referenceId) {
  return `[cite:${referenceId}]`;
}

function citationTokens(referenceIds = []) {
  return referenceIds.map(citationToken).join("");
}

function appendCitationTokens(text, referenceIds = []) {
  const base = normalizeString(text);
  const missing = referenceIds.filter((referenceId) => !base.includes(citationToken(referenceId)));
  if (missing.length === 0) {
    return base;
  }
  return `${base}${base ? " " : ""}${citationTokens(missing)}`;
}

function appendSentenceWithCitations(text, sentence, referenceIds = []) {
  const base = normalizeString(text);
  const cleanSentence = normalizeString(sentence).replace(/\s*\[@[^\]]+\]/g, "");
  if (!cleanSentence) {
    return appendCitationTokens(base, referenceIds);
  }
  if (base.includes(cleanSentence)) {
    return appendCitationTokens(base, referenceIds);
  }
  return `${base}${base ? "\n\n" : ""}${appendCitationTokens(cleanSentence, referenceIds)}`;
}

function addReferenceIds(existing = [], referenceIds = []) {
  const seen = new Set(Array.isArray(existing) ? existing : []);
  const next = Array.isArray(existing) ? [...existing] : [];
  for (const referenceId of referenceIds) {
    if (!seen.has(referenceId)) {
      seen.add(referenceId);
      next.push(referenceId);
    }
  }
  return next;
}

function recordChange(changes, path, before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  changes.push({ path, before, after });
}

function updateStringField(article, changes, path, updater) {
  const segments = path.split(".");
  let target = article;
  for (const segment of segments.slice(0, -1)) {
    target[segment] ??= {};
    target = target[segment];
  }
  const key = segments.at(-1);
  const before = target[key];
  const after = updater(typeof before === "string" ? before : "");
  target[key] = after;
  recordChange(changes, path, before, after);
}

function upsertHarmSummary(article, changes, sentence, referenceIds) {
  article.harm_potential ??= {};
  const before = article.harm_potential.summary;
  const after = appendSentenceWithCitations(before, sentence, referenceIds);
  article.harm_potential.summary = after;
  recordChange(changes, "harm_potential.summary", before, after);
}

function addRouteReferenceIds(article, changes, collectionPath, routeName, referenceIds) {
  const [section, field] = collectionPath.split(".");
  const routes = article?.[section]?.[field];
  if (!Array.isArray(routes)) {
    return;
  }
  const routeIndex = routes.findIndex((route) => String(route?.route ?? "").toLowerCase() === routeName);
  if (routeIndex === -1) {
    return;
  }
  const route = routes[routeIndex];
  const before = Array.isArray(route.reference_ids) ? [...route.reference_ids] : [];
  const after = addReferenceIds(before, referenceIds);
  route.reference_ids = after;
  recordChange(changes, `${collectionPath}[${routeIndex}].reference_ids`, before, after);
}

function findHistorySection(article, heading) {
  const sections = article?.history_culture?.sections;
  if (!Array.isArray(sections)) {
    return null;
  }
  const normalized = heading.toLowerCase();
  const index = sections.findIndex((section) => normalizeString(section?.heading).toLowerCase() === normalized);
  return index >= 0 ? { section: sections[index], index } : null;
}

function appendHistorySectionContent(article, changes, heading, sentence, referenceIds) {
  const match = findHistorySection(article, heading);
  if (!match) {
    return;
  }
  const before = match.section.content;
  const after = appendSentenceWithCitations(before, sentence, referenceIds);
  match.section.content = after;
  recordChange(changes, `history_culture.sections[${match.index}].content`, before, after);
}

function appendHistorySectionCitations(article, changes, heading, referenceIds) {
  const match = findHistorySection(article, heading);
  if (!match) {
    return;
  }
  const before = match.section.content;
  const after = appendCitationTokens(before, referenceIds);
  match.section.content = after;
  recordChange(changes, `history_culture.sections[${match.index}].content`, before, after);
}

function updateMaoiInteraction(article, changes, referenceIds) {
  const caution = article?.interactions?.caution;
  if (!Array.isArray(caution)) {
    return;
  }
  const index = caution.findIndex((entry) => normalizeString(entry).toLowerCase().startsWith("maois"));
  if (index === -1) {
    return;
  }
  const before = caution[index];
  const withoutClose = normalizeString(before).replace(/\)\s*$/, "");
  const suffix = "2C-B is metabolized by MAO-A and MAO-B, and MAO inhibitors may potentiate its effects.";
  const withSentence = withoutClose.includes(suffix) ? withoutClose : `${withoutClose}; ${suffix}`;
  const after = `${appendCitationTokens(withSentence, referenceIds)})`;
  caution[index] = after;
  recordChange(changes, `interactions.caution[${index}]`, before, after);
}

function collectCitationIdsFromContent(content) {
  const strings = [];
  collectStrings(content, new WeakSet(), strings);

  const ids = [];
  const seen = new Set();
  for (const text of strings) {
    for (const token of extractCitationTokens(text)) {
      if (!seen.has(token.id)) {
        seen.add(token.id);
        ids.push(token.id);
      }
    }
  }
  return ids;
}

function collectStrings(value, seen, strings) {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, seen, strings);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "references" || key === "citations" || key === "source_citations" || key === "editorial_review") {
      continue;
    }
    collectStrings(child, seen, strings);
  }
}

function pushCitationId(id, orderedIds, seen) {
  if (typeof id !== "string") return;
  const trimmed = id.trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  orderedIds.push(trimmed);
}

function collectCitationIdsFromText(value, orderedIds, seen) {
  for (const token of extractCitationTokens(value)) {
    pushCitationId(token.id, orderedIds, seen);
  }
}

function collectReferenceIds(value, orderedIds, seen) {
  if (!Array.isArray(value)) return;
  for (const referenceId of value) {
    pushCitationId(referenceId, orderedIds, seen);
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectDosageDurationCitationIds(article, orderedIds, seen) {
  const dosage = asRecord(article.dosage) ?? {};
  const duration = asRecord(article.duration) ?? {};
  const dosageRoutes = asArray(dosage.routes).map((route) => asRecord(route)).filter(Boolean);
  const durationRoutes = asArray(duration.routes).map((route) => asRecord(route)).filter(Boolean);
  const orderedRoutes = [];
  const routeNames = new Set();

  const pushRouteName = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || routeNames.has(trimmed)) return;
    routeNames.add(trimmed);
    orderedRoutes.push(trimmed);
  };

  for (const route of dosageRoutes) pushRouteName(route.route);
  for (const route of durationRoutes) pushRouteName(route.route);

  for (const routeName of orderedRoutes) {
    const dosageRoute = dosageRoutes.find((route) => route.route === routeName);
    if (dosageRoute) {
      collectReferenceIds(dosageRoute.reference_ids, orderedIds, seen);
      collectCitationIdsFromText(dosageRoute.bioavailability, orderedIds, seen);
      collectCitationIdsFromText(dosageRoute.bioavailability_notes, orderedIds, seen);
      collectCitationIdsFromText(dosageRoute.notes, orderedIds, seen);
    }

    const durationRoute = durationRoutes.find((route) => route.route === routeName);
    if (durationRoute) {
      collectReferenceIds(durationRoute.reference_ids, orderedIds, seen);
      collectCitationIdsFromText(durationRoute.half_life, orderedIds, seen);
      collectCitationIdsFromText(durationRoute.half_life_notes, orderedIds, seen);
    }
  }

  const plateauDosing = asRecord(dosage.plateau_dosing);
  if (!plateauDosing) return;

  for (const key of ["first_plateau", "second_plateau", "third_plateau", "fourth_plateau", "fifth_plateau"]) {
    const plateau = asRecord(plateauDosing[key]);
    if (plateau) {
      collectCitationIdsFromText(plateau.effects, orderedIds, seen);
    }
  }
  collectCitationIdsFromText(plateauDosing.notes, orderedIds, seen);
}
