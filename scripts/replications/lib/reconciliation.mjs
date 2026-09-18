import fs from "fs";
import path from "path";

const LEGACY_EFFECT_SLUG_ALIASES = {
  breathing: "drifting",
  melting: "drifting",
  flowing: "drifting",
  warping: "drifting",
  "visual-drifting": "drifting",
  "closed-eye-visuals": "internal-hallucination",
  "color-modulation": "colour-shifting",
  "external-hallucinations": "external-hallucination",
  "hallucinatory-entities": "autonomous-entity",
  "internal-hallucinations": "internal-hallucination",
  "loss-of-contact-with-reality": "derealization",
  "open-eye-visuals": "environmental-patterning",
  "visual-distortions": "perspective-distortion",
  "visual-geometry": "geometry",
  "color-enhancement": "colour-enhancement",
  "peripheral-pareidolia": "increased-pareidolia",
}

const REPLICATION_EFFECT_OVERRIDES = {
  "hatmancometh-unknown": "shadow-people",
  "shadow-gang-unknown": "shadow-people",
  "shadow-people-unknown": "shadow-people",
  "shadow_people-unknown": "shadow-people",
  "shadowhand-unknown": "shadow-people",
  "shadowlady-unknown": "shadow-people",
  "shadowpersonanomymous-unknown": "shadow-people",
  "sleep_paralysis_shadow_peeps_by_xanny-unknown": "shadow-people",
};

export function canonicalizeEffectSlug(effectSlug) {
  if (!effectSlug) {
    return null;
  }

  return LEGACY_EFFECT_SLUG_ALIASES[effectSlug] ?? effectSlug;
}

export function dedupePreserveOrder(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

export function readSimpleEnvFile(filePath) {
  const env = {};

  if (!fs.existsSync(filePath)) {
    return env;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export function loadGalleryOrderMapping(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Map();
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const mapping = new Map();

  for (const [effectSlug, replicationSlugs] of Object.entries(raw)) {
    const canonicalEffectSlug = canonicalizeEffectSlug(effectSlug);
    if (!canonicalEffectSlug) {
      continue;
    }

    const existing = mapping.get(canonicalEffectSlug) ?? [];
    mapping.set(
      canonicalEffectSlug,
      dedupePreserveOrder([...existing, ...(Array.isArray(replicationSlugs) ? replicationSlugs : [])]),
    );
  }

  return mapping;
}

export function applyGalleryOrderMappingsToMetadata(replications, galleryOrderMapping) {
  const replicationsBySlug = new Map(replications.map((replication) => [replication.slug, replication]));
  let assigned = 0;

  for (const [effectSlug, replicationSlugs] of galleryOrderMapping.entries()) {
    for (const replicationSlug of replicationSlugs) {
      const replication = replicationsBySlug.get(replicationSlug);
      if (!replication) {
        continue;
      }

      if (replication.effect_slug !== effectSlug) {
        replication.effect_slug = effectSlug;
        assigned++;
      }
    }
  }

  for (const [replicationSlug, effectSlug] of Object.entries(REPLICATION_EFFECT_OVERRIDES)) {
    const replication = replicationsBySlug.get(replicationSlug);
    if (!replication) {
      continue;
    }

    if (replication.effect_slug !== effectSlug) {
      replication.effect_slug = effectSlug;
      assigned++;
    }
  }

  return assigned;
}

export function buildGalleryOrderByEffect(replications, galleryOrderMapping) {
  const galleryOrderByEffect = new Map();

  for (const [effectSlug, replicationSlugs] of galleryOrderMapping.entries()) {
    galleryOrderByEffect.set(effectSlug, dedupePreserveOrder(replicationSlugs));
  }

  for (const replication of replications) {
    const effectSlug = canonicalizeEffectSlug(replication.effect_slug);
    if (!effectSlug) {
      continue;
    }

    const existing = galleryOrderByEffect.get(effectSlug) ?? [];
    galleryOrderByEffect.set(effectSlug, dedupePreserveOrder([...existing, replication.slug]));
  }

  return galleryOrderByEffect;
}

export function resolveReplicationsPaths(scriptDir) {
  const exportsDir = path.join(scriptDir, "..", "..", "notes-and-plans", "exports", "replications");

  return {
    exportsDir,
    metadataFile: path.join(exportsDir, "replications-metadata.json"),
    galleryOrderMappingFile: path.join(exportsDir, "gallery-order-mapping.json"),
    envFile: path.join(scriptDir, "..", "..", ".env.local"),
  };
}
