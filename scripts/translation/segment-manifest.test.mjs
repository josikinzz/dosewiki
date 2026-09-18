import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleLocaleDataset,
  buildManifest,
  buildWorkUnits,
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

test("bibliography and chemical identity produce no segments", () => {
  const { segments } = extractSegments(dataset());
  const groups = new Set(segments.map((segment) => segment.group));

  for (const excluded of ["references", "citations", "source_citations", "identification", "title", "slug"]) {
    assert.equal(groups.has(excluded), false, `${excluded} must not be translated`);
  }
  assert.equal(
    segments.some((segment) => segment.source.includes("66142-81-2")),
    false,
  );
});

test("machine enumerations and bare measurements stay out of the manifest", () => {
  const { segments } = extractSegments(dataset());
  const sources = segments.map((segment) => segment.source);

  assert.equal(sources.includes("moderate"), false, "enum level is not prose");
  assert.equal(sources.includes("oral"), false, "route is a key, not prose");
  assert.equal(sources.includes("mg"), false, "unit is not prose");
  assert.equal(sources.includes("5-HT2A"), false, "receptor target is an identifier");
  assert.ok(sources.includes("Take 10-20 mg with food."));
  assert.ok(sources.includes("Habit forming."));
});

test("values that become routes, icons, or visibility switches stay English", () => {
  const { segments } = extractSegments(
    dataset({
      classification: { chemical_class: ["Phenethylamine"], psychoactive_class: ["Psychedelic"] },
      index_categories: ["hidden"],
    }),
  );
  const sources = segments.map((segment) => segment.source);

  // These slugify into /substances/group/<slug>, icon-map keys, and the
  // hidden/obscure publish switch.
  assert.equal(sources.includes("Phenethylamine"), false);
  assert.equal(sources.includes("Psychedelic"), false);
  assert.equal(sources.includes("hidden"), false);
});

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

test("display-only legality and dosage labels are translated", () => {
  const { segments } = extractSegments(
    dataset({
      legality: { countries: { Peru: { status: "Illegal", canonicalStatus: "prohibited", designation: "Lista I" } } },
      dosage: { routes: [{ route: "oral", bioavailability: "Low", bioavailability_notes: "Extensive first-pass metabolism." }] },
    }),
  );
  const sources = segments.map((segment) => segment.source);

  assert.ok(sources.includes("Lista I"), "designation is rendered text, not a key");
  assert.ok(sources.includes("Low"), "bioavailability is rendered text, not a key");
});

test("numeric and measurement leaves are never translatable values", () => {
  assert.equal(isTranslatableValue("20-30 mg"), false);
  assert.equal(isTranslatableValue("4 hours"), false);
  assert.equal(isTranslatableValue("1.2-2.5 h"), false);
  assert.equal(isTranslatableValue("https://example.org"), false);
  assert.equal(isTranslatableValue(15), false);
  assert.equal(isTranslatableValue("Take 10-20 mg with food."), true);
});

test("safety groups carry the safety context class", () => {
  const { segments } = extractSegments(dataset());
  const dosage = segments.find((segment) => segment.group === "dosage");
  const summary = segments.find((segment) => segment.group === "summary");

  assert.equal(dosage.contextClass, "safety");
  assert.equal(summary.contextClass, "prose");
});

test("two runs over the same export produce identical manifests", () => {
  const first = buildManifest(dataset(), { locale: "zh-Hans", source: "test" });
  const second = buildManifest(dataset(), { locale: "zh-Hans", source: "test" });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("editing one string changes exactly one segment hash", () => {
  const before = extractSegments(dataset()).segments;
  const after = extractSegments(dataset({ summary: "A psychedelic phenethylamine, edited." })).segments;

  assert.equal(before.length, after.length);
  const changed = before.filter((segment, index) => segment.hash !== after[index].hash);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].group, "summary");
});

test("identical strings collapse into one work unit", () => {
  const twin = dataset();
  twin.items.push({ ...twin.items[0], slug: "2c-e" });
  const { segments } = extractSegments(twin);
  const units = buildWorkUnits(segments);

  assert.equal(segments.length > units.length, true);
  const summaryUnit = units.find((unit) => unit.source === "A psychedelic phenethylamine.");
  assert.equal(summaryUnit.occurrences, 2);
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

test("a missing translation leaves the source string in place", () => {
  const source = dataset();
  const { segments } = extractSegments(source);
  const { dataset: translated, missing } = assembleLocaleDataset(source, segments, new Map(), {
    locale: "zh-Hans",
  });

  assert.equal(missing, segments.length);
  assert.equal(translated.items[0].summary, "A psychedelic phenethylamine.");
});

test("structural diff reports type, length, and key drift", () => {
  assert.deepEqual(structuralDiff({ a: "x" }, { a: "y" }), []);
  assert.equal(structuralDiff({ a: "x" }, { a: 1 }).length, 1);
  assert.equal(structuralDiff({ a: [1, 2] }, { a: [1] }).length, 1);
  assert.equal(structuralDiff({ a: 1 }, { a: 1, b: 2 }).length, 1);
});
