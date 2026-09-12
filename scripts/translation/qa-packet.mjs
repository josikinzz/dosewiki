/**
 * QA packet for a locale translation run. Pure: it reports what the run did,
 * and refuses to describe a run as publishable on its own.
 *
 * The packet is what a human reads before publication: coverage, the failure
 * queue, a review sample beside its sources, every safety segment that carries
 * a warning, and glossary drift.
 */

import { glossaryTermPattern } from "./locales.mjs";
import { DEFECT_CODES, isBlocking } from "./validate.mjs";

const SAMPLE_SIZE = 20;

/** Deterministic sampler: same run inputs produce the same review sample. */
function sampleEvenly(items, count) {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)]);
}

function percent(part, total) {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

export function buildQaPacket({
  locale,
  glossary = {},
  model,
  manifest,
  segments,
  units,
  translations,
  failures,
  usage,
  cost,
  elapsedMs,
  structuralDiff,
  applied,
  missing,
  corpus = null,
  reconciliation = null,
}) {
  const translated = units.filter((unit) => {
    const entry = translations.get(unit.hash);
    return entry && typeof entry.target === "string" && entry.target.length > 0;
  });

  // A resumed run only lists the failures it produced itself, so counting those
  // would report a corpus as fully validated while its checkpoint still holds
  // segments the artifact fell back to English on. The verdict on disk is the
  // one that decided what shipped, so it is the one that gets counted.
  const rejected = new Set(
    [...translations]
      .filter(([, entry]) => isBlocking(entry.defects ?? []))
      .map(([hash]) => hash),
  );
  const validated = translated.filter((unit) => !rejected.has(unit.hash));

  const defectCounts = {};
  for (const [, entry] of translations) {
    for (const defect of entry.defects ?? []) {
      defectCounts[defect] = (defectCounts[defect] ?? 0) + 1;
    }
  }

  const reviewSample = sampleEvenly(
    validated.filter((unit) => unit.words >= 8),
    SAMPLE_SIZE,
  ).map((unit) => ({
    hash: unit.hash,
    group: unit.group,
    contextClass: unit.contextClass,
    occurrences: unit.occurrences,
    source: unit.source,
    target: translations.get(unit.hash).target,
  }));

  const safetyUnits = validated.filter((unit) => unit.contextClass === "safety");
  const glossaryDrift = [];
  for (const [term, expected] of Object.entries(glossary)) {
    const pattern = glossaryTermPattern(term);
    const seen = validated.filter((unit) => pattern.test(unit.source));
    if (seen.length === 0) continue;
    const held = seen.filter((unit) => translations.get(unit.hash).target.includes(expected));
    glossaryDrift.push({
      term,
      expected,
      occurrences: seen.length,
      heldPercent: percent(held.length, seen.length),
      driftedSamples: seen
        .filter((unit) => !translations.get(unit.hash).target.includes(expected))
        .slice(0, 3)
        .map((unit) => ({ source: unit.source.slice(0, 160), target: translations.get(unit.hash).target.slice(0, 160) })),
    });
  }

  const segmentsByGroup = {};
  for (const segment of segments) {
    segmentsByGroup[segment.group] = (segmentsByGroup[segment.group] ?? 0) + 1;
  }

  return {
    verdict: null,
    verdictNote: "Publication is blocked until a reviewer records a verdict here.",
    locale: locale.code,
    corpus: corpus?.id ?? null,
    dataset: corpus?.dataset ?? manifest.dataset ?? null,
    model,
    generatedAt: new Date().toISOString(),
    source: manifest.source,
    sourceGeneratedAt: manifest.sourceGeneratedAt,
    run: {
      elapsedMs,
      requests: usage.requests,
      retries: usage.retries,
      promptTokens: usage.prompt,
      completionTokens: usage.completion,
      costUsd: Number(cost.toFixed(4)),
    },
    coverage: {
      items: new Set(segments.map((segment) => segment.slug)).size,
      segments: segments.length,
      workUnits: units.length,
      translatedUnits: translated.length,
      validatedUnits: validated.length,
      validatedPercent: percent(validated.length, units.length),
      appliedSegments: applied,
      missingSegments: missing,
      segmentsByGroup,
    },
    structure: {
      identical: structuralDiff.length === 0,
      mismatches: structuralDiff,
    },
    // Every VCode body the run rebuilt, and every one whose tree moved and so
    // kept its English. A rejected body is a defect in the translation, not in
    // the source: the source parsed, and the source tree is what it failed.
    reconciliation: reconciliation
      ? {
          bodies: reconciliation.bodies,
          treesRebuilt: reconciliation.reparsed,
          rejectedBodies: reconciliation.rejected.length,
          rejected: reconciliation.rejected.slice(0, 50),
        }
      : null,
    defectCounts,
    failureQueue: failures.slice(0, 200).map((failure) => ({
      hash: failure.hash,
      group: failure.group,
      defects: failure.defects,
      source: failure.source.slice(0, 400),
      target: (failure.target ?? "").slice(0, 400),
    })),
    failureQueueTotal: failures.length,
    reviewSample,
    safetySegments: {
      total: safetyUnits.length,
      withNumbers: safetyUnits.filter((unit) => /\d/.test(unit.source)).length,
      flaggedForReading: sampleEvenly(safetyUnits, 40).map((unit) => ({
        hash: unit.hash,
        group: unit.group,
        source: unit.source,
        target: translations.get(unit.hash).target,
      })),
    },
    glossaryDrift,
    nonBlockingNotes: {
      lengthBand: defectCounts[DEFECT_CODES.LENGTH_BAND] ?? 0,
      glossaryMiss: defectCounts[DEFECT_CODES.GLOSSARY_MISS] ?? 0,
    },
  };
}
