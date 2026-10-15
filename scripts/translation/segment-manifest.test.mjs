import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleLocaleDataset,
  extractSegments,
  isTranslatableValue,
  structuralDiff,
} from "./segment-manifest.mjs";

function dataset(overrides = {}) {
  return {
    dataset: "SubstanceIndex",
    generatedAt: "2026-09-09T09:13:24.893Z",
    items: [
      {
        slug: "2c-b",
        title: "2C-B",
        summary: "A psychedelic phenethylamine.",
        dosage: {
          routes: [
            {
              route: "oral",
              unit: "mg",
              notes: "Take 10-20 mg with food.",
              dose_ranges: { light: { min: 5, max: 10, unit: "mg" } },
              reference_ids: ["pihkal-shulgin-1991"],
            },
          ],
        },
        harm_potential: {
          addiction: { psychological: { level: "moderate", description: "Habit forming." } },
          toxicity: {
            organ_toxicity: [{ system: "Cardiovascular", findings: "May affect the heart." }],
          },
        },
        pharmacology: { binding_sites: [{ target: "5-HT2A", notes: "Partial agonist." }] },
        identification: { cas_number: "66142-81-2", smiles: "CCOc1cc(CCN)ccc1Br" },
        references: [{ title: "PiHKAL", url: "https://example.org" }],
        citations: [{ name: "Shulgin 1991", url: "https://example.org" }],
        ...overrides,
      },
    ],
  };
}

test("a country status travels only when canonicalStatus carries the meaning", () => {
  const withKey = extractSegments(
    dataset({
      legality: { countries: { Germany: { status: "Illegal", canonicalStatus: "prohibited" } } },
    }),
  ).segments.map((segment) => segment.source);
  assert.ok(withKey.includes("Illegal"), "display-only status is translatable");

  const withoutKey = extractSegments(
    dataset({ legality: { countries: { Germany: { status: "Illegal" } } } }),
  ).segments.map((segment) => segment.source);
  assert.equal(
    withoutKey.includes("Illegal"),
    false,
    "without canonicalStatus the English status picks the badge tone",
  );
});

test("numeric and measurement leaves are never translatable values", () => {
  assert.equal(isTranslatableValue("20-30 mg"), false);
  assert.equal(isTranslatableValue("4 hours"), false);
  assert.equal(isTranslatableValue("1.2-2.5 h"), false);
  assert.equal(isTranslatableValue("https://example.org"), false);
  assert.equal(isTranslatableValue(15), false);
  assert.equal(isTranslatableValue("Take 10-20 mg with food."), true);
});

test("assembly writes translations back without changing structure", () => {
  const source = dataset();
  const { segments } = extractSegments(source);
  const translations = new Map(segments.map((segment) => [segment.hash, `ZH:${segment.source}`]));

  const { dataset: translated, applied, missing } = assembleLocaleDataset(source, segments, translations, {
    locale: "zh-Hans",
  });

  assert.equal(applied, segments.length);
  assert.equal(missing, 0);
  assert.deepEqual(structuralDiff(source.items, translated.items), []);
  assert.equal(translated.items[0].summary, "ZH:A psychedelic phenethylamine.");
  assert.equal(translated.items[0].identification.cas_number, "66142-81-2");
  assert.equal(translated.items[0].dosage.routes[0].dose_ranges.light.min, 5);
});
