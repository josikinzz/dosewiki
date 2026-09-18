const ROUTE_ALIASES = {
  oral: "Oral",
  insufflated: "Insufflated",
  intranasal: "Insufflated",
  snorted: "Insufflated",
  sublingual: "Sublingual",
  buccal: "Sublingual",
  smoked: "Smoked",
  inhalation: "Smoked",
  vaporized: "Vaporized",
  vaporised: "Vaporized",
  intravenous: "Intravenous",
  iv: "Intravenous",
  intramuscular: "Intramuscular",
  im: "Intramuscular",
  rectal: "Rectal",
  plugged: "Rectal",
};

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value) {
  return isRecord(value) ? value : {};
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value) {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function asStringRecord(value) {
  const record = asRecord(value);
  const entries = Object.entries(record)
    .map(([key, entry]) => [key.trim(), asString(entry).trim()])
    .filter(([key, entry]) => key.length > 0 && entry.length > 0);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function normalizeProfileKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function deriveReceptorFromTag(tag) {
  const trimmed = asString(tag).trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(.+?)\s+receptor\b/i);
  return match ? match[1].trim() : trimmed;
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asPreservedOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeBindingSiteEntry(rawEntry, targetKey = "target") {
  const entry = asRecord(rawEntry);
  const tag = asPreservedOptionalString(entry.tag);
  const target =
    asPreservedOptionalString(entry[targetKey]) ??
    (tag ? deriveReceptorFromTag(tag) : "");
  const affinity = asPreservedOptionalString(entry.affinity);
  const efficacy = asPreservedOptionalString(entry.efficacy);

  if (!target && !tag && !affinity && !efficacy) {
    return null;
  }

  return {
    target,
    ...(tag ? { tag } : {}),
    ...(affinity ? { affinity } : {}),
    ...(efficacy ? { efficacy } : {}),
  };
}

function mergeBindingSiteEntry(target, incoming) {
  if (!target.target && incoming.target) {
    target.target = incoming.target;
  }
  if (!target.tag && incoming.tag) {
    target.tag = incoming.tag;
  }
  if (!target.affinity && incoming.affinity) {
    target.affinity = incoming.affinity;
  }
  if (!target.efficacy && incoming.efficacy) {
    target.efficacy = incoming.efficacy;
  }
}

function addBindingSiteEntry(mergedEntries, byKey, candidate, targetKey = "target") {
  const normalized = normalizeBindingSiteEntry(candidate, targetKey);
  if (!normalized) {
    return;
  }

  const keySource = normalized.tag || normalized.target;
  const key = normalizeProfileKey(keySource);

  if (!key) {
    mergedEntries.push(normalized);
    return;
  }

  const existing = byKey.get(key);
  if (existing) {
    mergeBindingSiteEntry(existing, normalized);
    return;
  }

  byKey.set(key, normalized);
  mergedEntries.push(normalized);
}

function buildCanonicalBindingSites(pharmacology) {
  const mergedEntries = [];
  const byKey = new Map();
  const bindingSites = Array.isArray(pharmacology.binding_sites)
    ? pharmacology.binding_sites
    : [];

  bindingSites.forEach((entry) =>
    addBindingSiteEntry(mergedEntries, byKey, entry, "target"),
  );
  return mergedEntries;
}

function buildLegacyBindingSites(pharmacology) {
  const mergedEntries = [];
  const byKey = new Map();
  const receptorProfile = Array.isArray(pharmacology.receptor_profile)
    ? pharmacology.receptor_profile
    : [];

  receptorProfile.forEach((entry) =>
    addBindingSiteEntry(mergedEntries, byKey, entry, "receptor"),
  );

  const mechanismOfAction = asStringArray(pharmacology.mechanism_of_action);
  mechanismOfAction.forEach((tag) => {
    addBindingSiteEntry(mergedEntries, byKey, {
      target: deriveReceptorFromTag(tag),
      tag,
    });
  });

  const receptorBinding = asRecord(pharmacology.receptor_binding);
  for (const [target, rawBinding] of Object.entries(receptorBinding)) {
    const binding = asPreservedOptionalString(rawBinding);
    if (!binding) {
      continue;
    }

    addBindingSiteEntry(mergedEntries, byKey, { target, efficacy: binding });
  }

  return mergedEntries;
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (!isRecord(value)) {
    return JSON.stringify(value);
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

function collectBindingSiteIssues(pharmacology) {
  const issues = [];
  const inspectEntries = (key, targetKey) => {
    if (!hasOwn(pharmacology, key)) {
      return;
    }
    if (!Array.isArray(pharmacology[key])) {
      issues.push(`${key} must be an array`);
      return;
    }

    pharmacology[key].forEach((rawEntry, index) => {
      if (!isRecord(rawEntry)) {
        issues.push(`${key}[${index}] must be an object`);
        return;
      }
      if (typeof rawEntry[targetKey] !== "string") {
        issues.push(`${key}[${index}].${targetKey} must be a string`);
      }
      for (const optionalKey of ["tag", "affinity", "efficacy"]) {
        if (
          rawEntry[optionalKey] !== undefined &&
          typeof rawEntry[optionalKey] !== "string"
        ) {
          issues.push(`${key}[${index}].${optionalKey} must be a string`);
        }
      }
    });
  };

  inspectEntries("binding_sites", "target");
  inspectEntries("receptor_profile", "receptor");

  if (
    hasOwn(pharmacology, "mechanism_of_action") &&
    !Array.isArray(pharmacology.mechanism_of_action)
  ) {
    issues.push("mechanism_of_action must be an array");
  }
  if (
    hasOwn(pharmacology, "receptor_binding") &&
    !isRecord(pharmacology.receptor_binding)
  ) {
    issues.push("receptor_binding must be an object");
  }

  return issues;
}

const SUSPICIOUS_TARGET_PATTERN =
  /\b(?:prodrug|metaboli[sz]|converted|conversion|hydroly[sz]|effects?|affects?|reuptake inhibitor|releasing agent|unknown)\b/i;

function findSuspiciousTargets(bindingSites) {
  return bindingSites.flatMap((entry, index) =>
    SUSPICIOUS_TARGET_PATTERN.test(entry.target)
      ? [{ index, target: entry.target, reason: "target looks like a mechanism or process" }]
      : [],
  );
}

export function planBindingSiteMigration(rawPharmacology) {
  const pharmacology = asRecord(rawPharmacology);
  const canonicalPresent = hasOwn(pharmacology, "binding_sites");
  const legacyKeys = [
    "receptor_profile",
    "mechanism_of_action",
    "receptor_binding",
  ].filter((key) => hasOwn(pharmacology, key));
  const canonicalBindingSites = buildCanonicalBindingSites(pharmacology);
  const legacyBindingSites = buildLegacyBindingSites(pharmacology);
  const legacyHasData = legacyBindingSites.length > 0;
  const issues = collectBindingSiteIssues(pharmacology);
  const conflicts = [];

  if (
    canonicalPresent &&
    legacyHasData &&
    stableSerialize(canonicalBindingSites) !== stableSerialize(legacyBindingSites)
  ) {
    conflicts.push("binding_sites and legacy pharmacology fields contain different entries");
  }

  let status;
  if (issues.length > 0) {
    status = "invalid";
  } else if (conflicts.length > 0) {
    status = "conflict";
  } else if (canonicalPresent && legacyKeys.length > 0) {
    status = "equivalent";
  } else if (canonicalPresent) {
    status = "canonical";
  } else if (legacyKeys.length > 0) {
    status = "legacy";
  } else {
    status = "empty";
  }

  const bindingSites = canonicalPresent
    ? canonicalBindingSites
    : legacyBindingSites;

  return {
    status,
    bindingSites,
    legacyKeys,
    conflicts,
    issues,
    suspiciousTargets: findSuspiciousTargets(bindingSites),
    needsMigration: !canonicalPresent || legacyKeys.length > 0,
  };
}

export function migratePharmacologyBindingSites(rawPharmacology) {
  const pharmacology = asRecord(rawPharmacology);
  const removedKeys = new Set([
    "binding_sites",
    "receptor_profile",
    "mechanism_of_action",
    "receptor_binding",
    "metabolism",
  ]);
  const preserved = Object.fromEntries(
    Object.entries(pharmacology).filter(
      ([key, value]) =>
        !removedKeys.has(key) && !(key === "bioavailability" && value === null),
    ),
  );
  const metabolism = pharmacology.metabolism;
  const pharmacokinetics = hasOwn(preserved, "pharmacokinetics")
    ? preserved.pharmacokinetics
    : metabolism;

  return {
    ...preserved,
    pharmacodynamics: hasOwn(preserved, "pharmacodynamics")
      ? preserved.pharmacodynamics
      : "",
    binding_sites: planBindingSiteMigration(pharmacology).bindingSites,
    ...(pharmacokinetics === undefined ? {} : { pharmacokinetics }),
  };
}

const REVIEWED_EVIDENCE_PATH_DISPOSITIONS = new Map([
  [
    "amphetamine\u0000taar1-d-isomer-more-potent\u0000pharmacology.receptor_binding.TAAR1",
    "pharmacology.binding_sites[20].efficacy",
  ],
  [
    "amphetamine\u0000taar1-mechanism-of-action-marker\u0000pharmacology.mechanism_of_action[2]",
    "pharmacology.binding_sites[16].tag",
  ],
]);

export function remapBindingSiteFieldPath(fieldPath) {
  if (typeof fieldPath !== "string") {
    return { status: "unchanged", path: fieldPath };
  }

  const unsupportedPrefixes = [
    "pharmacology.receptor_binding",
    "pharmacology.mechanism_of_action",
  ];
  const unsupportedPrefix = unsupportedPrefixes.find((prefix) =>
    fieldPath === prefix ||
    fieldPath.startsWith(`${prefix}[`) ||
    fieldPath.startsWith(`${prefix}.`),
  );
  if (unsupportedPrefix) {
    return {
      status: "unmappable",
      path: fieldPath,
      reason: `${unsupportedPrefix} has no stable binding-site row index`,
    };
  }

  const legacyPrefix = "pharmacology.receptor_profile";
  if (
    fieldPath !== legacyPrefix &&
    !fieldPath.startsWith(`${legacyPrefix}[`) &&
    !fieldPath.startsWith(`${legacyPrefix}.`)
  ) {
    return { status: "unchanged", path: fieldPath };
  }

  const canonicalPath = fieldPath.replace(
    legacyPrefix,
    "pharmacology.binding_sites",
  );
  return {
    status: "remapped",
    path: canonicalPath.replace(
      /^(pharmacology\.binding_sites(?:\[[^\]]+\]|\.\d+))\.receptor(?=\.|$)/,
      "$1.target",
    ),
  };
}

export function remapBindingSiteEvidencePath({ slug, claimKey, fieldPath }) {
  const structuralResult = remapBindingSiteFieldPath(fieldPath);
  if (structuralResult.status !== "unmappable") {
    return structuralResult;
  }

  const reviewedPath = REVIEWED_EVIDENCE_PATH_DISPOSITIONS.get(
    `${slug}\u0000${claimKey}\u0000${fieldPath}`,
  );
  return reviewedPath
    ? { status: "remapped", path: reviewedPath }
    : structuralResult;
}

export function stripMarkdownCodeFences(text) {
  return asString(text)
    .replace(/^```(?:yaml|yml)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

export function normalizeRouteName(routeName) {
  const normalized = asString(routeName).toLowerCase().trim();
  return ROUTE_ALIASES[normalized] ?? asString(routeName).trim();
}

export function normalizePharmacologySection(rawPharmacology) {
  const pharmacology = asRecord(rawPharmacology);
  const summary = asOptionalString(pharmacology.summary);
  const routeBioavailability = asStringRecord(pharmacology.route_bioavailability);
  const routeHalfLife = asStringRecord(pharmacology.route_half_life);
  const routeHalfLifeNotes = asStringRecord(pharmacology.route_half_life_notes);
  const routeBioavailabilityNotes = asStringRecord(pharmacology.route_bioavailability_notes);

  return {
    pharmacodynamics: asString(pharmacology.pharmacodynamics).trim() || summary || "",
    ...(summary ? { summary } : {}),
    binding_sites: planBindingSiteMigration(pharmacology).bindingSites,
    pharmacokinetics: asString(pharmacology.pharmacokinetics).trim() || asString(pharmacology.metabolism).trim(),
    metabolites: asStringArray(pharmacology.metabolites),
    ...(asOptionalString(pharmacology.protein_binding)
      ? { protein_binding: asOptionalString(pharmacology.protein_binding) }
      : {}),
    ...(asOptionalString(pharmacology.volume_of_distribution)
      ? { volume_of_distribution: asOptionalString(pharmacology.volume_of_distribution) }
      : {}),
    ...(routeBioavailability ? { route_bioavailability: normalizeStringRecordKeys(routeBioavailability) } : {}),
    ...(routeHalfLife ? { route_half_life: normalizeStringRecordKeys(routeHalfLife) } : {}),
    ...(routeHalfLifeNotes ? { route_half_life_notes: normalizeStringRecordKeys(routeHalfLifeNotes) } : {}),
    ...(routeBioavailabilityNotes ? { route_bioavailability_notes: normalizeStringRecordKeys(routeBioavailabilityNotes) } : {}),
    ...(asOptionalString(pharmacology.bioavailability_notes)
      ? { bioavailability_notes: asOptionalString(pharmacology.bioavailability_notes) }
      : {}),
    ...(asOptionalString(pharmacology.half_life)
      ? { half_life: asOptionalString(pharmacology.half_life) }
      : {}),
  };
}

function normalizeStringRecordKeys(record) {
  return Object.fromEntries(
    Object.entries(record).map(([routeName, value]) => [normalizeRouteName(routeName), value]),
  );
}

export function getLegacyAwareMechanismTags(rawPharmacology) {
  return planBindingSiteMigration(rawPharmacology).bindingSites
    .map((entry) => entry.tag)
    .filter(Boolean);
}

export function hasPharmacologyContent(rawPharmacology) {
  const pharmacology = normalizePharmacologySection(rawPharmacology);
  return (
    pharmacology.pharmacodynamics.trim().length > 0 ||
    (pharmacology.summary ?? "").trim().length > 0 ||
    pharmacology.binding_sites.length > 0 ||
    pharmacology.pharmacokinetics.trim().length > 0 ||
    pharmacology.metabolites.length > 0
  );
}

/**
 * Whether a harm-potential block carries any actual content.
 *
 * The section previously counted as present whenever the keys existed, so an
 * article carrying an empty `harm_potential` scaffold rendered a section full of
 * blank subsections. Presence has to mean content, otherwise the gap notice
 * never fires for the articles that most need it.
 *
 * Presence has to mean *rendered* content, so every check below mirrors a guard
 * in `src/features/article/components/sections/harm-potential/`:
 *
 * - Addiction, psychosis, and seizure blocks render off their `description`;
 *   a `level` on its own paints no row (`AddictionSubsection`, `RisksSubsection`).
 * - Carcinogenicity and antibiotic-function cards are suppressed outright at
 *   `unknown` / `no_evidence`, whatever their description says — those levels
 *   carry boilerplate like "No carcinogenicity data available" (`ToxicitySubsection`).
 * - `toxicity.other` and a stringly `toxicity.carcinogenicity.evidence` have no
 *   renderer at all, so they cannot make the section present.
 *
 * Tolerates both the current schema and the legacy shape (`addiction_liability`,
 * `dependence_liability`, string `toxicity.ld50`, `risks` wrapper).
 */
export function hasHarmPotentialContent(rawHarmPotential) {
  const hp = rawHarmPotential;
  if (!hp || typeof hp !== "object") return false;

  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const list = (value) => Array.isArray(value) && value.length > 0;
  const described = (value) =>
    Boolean(value) && typeof value === "object" && text(value.description);
  // Legacy risk entries can be bare strings (`risks.psychosis: "..."`).
  const riskEntry = (value) => (text(value) ? true : described(value));
  const gradedCard = (value) => {
    if (text(value)) return true;
    if (!value || typeof value !== "object") return false;
    const level = typeof value.level === "string" ? value.level : null;
    if (level === "unknown" || level === "no_evidence") return false;
    return text(value.description) || level != null;
  };

  if (text(hp.summary)) return true;
  if (text(hp.addiction_liability) || text(hp.dependence_liability)) return true;

  if (described(hp.addiction?.psychological) || described(hp.addiction?.physical_dependence)) {
    return true;
  }
  if (riskEntry(hp.psychosis) || riskEntry(hp.seizure)) return true;
  if (riskEntry(hp.risks?.psychosis) || riskEntry(hp.risks?.seizure)) return true;

  const toxicity = hp.toxicity;
  if (toxicity && typeof toxicity === "object") {
    if (text(toxicity.ld50) || list(toxicity.ld50)) return true;
    if (list(toxicity.lethal_dosage?.ld50) || text(toxicity.lethal_dosage?.notes)) return true;
    if (list(toxicity.organ_toxicity) || text(toxicity.organ_toxicity)) return true;
    if (gradedCard(toxicity.carcinogenicity)) return true;
    if (gradedCard(toxicity.antibiotic_function)) return true;
  }

  return false;
}
