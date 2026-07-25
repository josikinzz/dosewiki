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

function normalizeReceptorEntry(rawEntry) {
  const entry = asRecord(rawEntry);
  const tag = asOptionalString(entry.tag);
  const receptor = asOptionalString(entry.receptor) ?? (tag ? deriveReceptorFromTag(tag) : "");
  const affinity = asOptionalString(entry.affinity);
  const efficacy = asOptionalString(entry.efficacy);

  if (!receptor && !tag && !affinity && !efficacy) {
    return null;
  }

  return {
    receptor,
    ...(tag ? { tag } : {}),
    ...(affinity ? { affinity } : {}),
    ...(efficacy ? { efficacy } : {}),
  };
}

function mergeReceptorEntry(target, incoming) {
  if (!target.receptor && incoming.receptor) {
    target.receptor = incoming.receptor;
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

function buildNormalizedReceptorProfile(rawPharmacology) {
  const pharmacology = asRecord(rawPharmacology);
  const mergedEntries = [];
  const byKey = new Map();

  const addEntry = (candidate) => {
    const normalized = normalizeReceptorEntry(candidate);
    if (!normalized) {
      return;
    }

    const keySource = normalized.tag || normalized.receptor;
    const key = normalizeProfileKey(keySource);

    if (!key) {
      mergedEntries.push(normalized);
      return;
    }

    const existing = byKey.get(key);
    if (existing) {
      mergeReceptorEntry(existing, normalized);
      return;
    }

    byKey.set(key, normalized);
    mergedEntries.push(normalized);
  };

  const receptorProfile = Array.isArray(pharmacology.receptor_profile)
    ? pharmacology.receptor_profile
    : [];
  receptorProfile.forEach(addEntry);

  const mechanismOfAction = asStringArray(pharmacology.mechanism_of_action);
  mechanismOfAction.forEach((tag) => {
    addEntry({ receptor: deriveReceptorFromTag(tag), tag });
  });

  const receptorBinding = asRecord(pharmacology.receptor_binding);
  for (const [receptor, rawBinding] of Object.entries(receptorBinding)) {
    const binding = asOptionalString(rawBinding);
    if (!binding) {
      continue;
    }

    addEntry({ receptor, efficacy: binding });
  }

  return mergedEntries;
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
    receptor_profile: buildNormalizedReceptorProfile(pharmacology),
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
  return buildNormalizedReceptorProfile(rawPharmacology)
    .map((entry) => entry.tag)
    .filter(Boolean);
}

export function hasPharmacologyContent(rawPharmacology) {
  const pharmacology = normalizePharmacologySection(rawPharmacology);
  return (
    pharmacology.pharmacodynamics.trim().length > 0 ||
    (pharmacology.summary ?? "").trim().length > 0 ||
    pharmacology.receptor_profile.length > 0 ||
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
 * Tolerates both the current schema and the legacy shape (`addiction_liability`,
 * `dependence_liability`, string `toxicity.ld50`, `risks` wrapper).
 */
export function hasHarmPotentialContent(rawHarmPotential) {
  const hp = rawHarmPotential;
  if (!hp || typeof hp !== "object") return false;

  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const list = (value) => Array.isArray(value) && value.length > 0;
  const risk = (value) =>
    Boolean(value) && (text(value.level) || text(value.description));

  if (text(hp.summary)) return true;
  if (text(hp.addiction_liability) || text(hp.dependence_liability)) return true;

  if (risk(hp.addiction?.psychological) || risk(hp.addiction?.physical_dependence)) return true;
  if (risk(hp.psychosis) || risk(hp.seizure)) return true;
  if (risk(hp.risks?.psychosis) || risk(hp.risks?.seizure)) return true;

  const toxicity = hp.toxicity;
  if (toxicity && typeof toxicity === "object") {
    if (text(toxicity.ld50) || list(toxicity.ld50)) return true;
    if (list(toxicity.lethal_dosage?.ld50) || text(toxicity.lethal_dosage?.notes)) return true;
    if (list(toxicity.organ_toxicity) || text(toxicity.organ_toxicity)) return true;
    if (text(toxicity.other)) return true;
    if (risk(toxicity.carcinogenicity) || text(toxicity.carcinogenicity?.evidence)) return true;
    if (risk(toxicity.antibiotic_function)) return true;
  }

  return false;
}
