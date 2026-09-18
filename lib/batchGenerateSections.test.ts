import { describe, expect, it, vi } from "vitest";

import {
  buildUserMessage as buildLegalityMessage,
  parseGeneratedYaml as parseLegalityYaml,
} from "../scripts/batch/legality/lib.mjs";
import { applyLegalityUpdate } from "../scripts/batch/legality/persist.mjs";
import {
  buildUserMessage as buildHistoryCultureMessage,
  parseGeneratedYaml as parseHistoryCultureYaml,
} from "../scripts/batch/history-culture/lib.mjs";
import { applyHistoryCultureUpdate } from "../scripts/batch/history-culture/persist.mjs";
import {
  buildUserMessage as buildHarmPotentialMessage,
  normalizeHarmPotential,
  parseGeneratedYaml as parseHarmPotentialYaml,
} from "../scripts/batch/harm-potential/lib.mjs";
import { applyHarmPotentialUpdate } from "../scripts/batch/harm-potential/persist.mjs";
import {
  buildUserMessage as buildDosageDurationMessage,
  mergeGeneratedWithExisting,
} from "../scripts/batch/dosage-duration/lib.mjs";
import { applyDosageDurationUpdate } from "../scripts/batch/dosage-duration/persist.mjs";
import { parseGeneratedYaml as parseDosageDurationYaml } from "../scripts/batch/dosage-duration/parser.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

type SectionCase = {
  section: string;
  yaml: string;
  parse: (text: string) => Json;
  assertParsed: (parsed: Json) => void;
  article: Json;
  buildMessage: (article: Json, quotes: string) => string;
  assertMessage: (message: string) => void;
  update: Json;
  apply: (article: Json, update: Json) => Json;
  assertApplied: (updated: Json) => void;
};

const QUOTES = "quoted sources";

const CASES: SectionCase[] = [
  {
    section: "legality",
    yaml: `
\`\`\`yaml
legality:
  international:
    - UN schedule
  countries:
    United States:
      status: Schedule I
      notes: federal
\`\`\`
`,
    parse: parseLegalityYaml,
    assertParsed: (parsed) => {
      expect(parsed.international).toEqual(["UN schedule"]);
      expect(parsed.countries["United States"].status).toBe("Schedule I");
    },
    article: {
      title: "Fixtureamine",
      summary: "summary",
      legality: { international: ["old"], countries: {} },
    },
    buildMessage: buildLegalityMessage,
    assertMessage: (message) => {
      expect(message).toContain(QUOTES);
      expect(message).toContain("summary:");
      expect(message).not.toContain("legality:");
    },
    update: { legality: { international: ["UN"], countries: {} } },
    apply: applyLegalityUpdate,
    assertApplied: (updated) => expect(updated.legality.international).toEqual(["UN"]),
  },
  {
    section: "history_culture",
    yaml: `
\`\`\`yaml
history_culture:
  content: Overview
  sections:
    - heading: Origins
      content: Started here
\`\`\`
`,
    parse: parseHistoryCultureYaml,
    assertParsed: (parsed) => {
      expect(parsed.content).toBe("Overview");
      expect(parsed.sections).toHaveLength(1);
    },
    article: {
      title: "Fixtureamine",
      summary: "summary",
      history_culture: { content: "old", sections: [{ heading: "old", content: "old" }] },
    },
    buildMessage: buildHistoryCultureMessage,
    assertMessage: (message) => {
      expect(message).toContain(QUOTES);
      expect(message).toContain("summary:");
      expect(message).not.toContain("history_culture:");
    },
    update: { history_culture: { content: "Overview", sections: [] } },
    apply: applyHistoryCultureUpdate,
    assertApplied: (updated) => expect(updated.history_culture.content).toBe("Overview"),
  },
  {
    section: "harm_potential",
    yaml: `
\`\`\`yaml
harm_potential:
  addiction:
    psychological:
      level: low
      description: low risk
  toxicity:
    ld50:
      - 100 mg/kg
  psychosis:
    level: low
    description: low
  seizure:
    level:
    description: ""
\`\`\`
`,
    parse: parseHarmPotentialYaml,
    assertParsed: (parsed) => {
      expect(parsed.addiction.psychological.level).toBe("low");
      // legacy ld50 arrays are lifted into lethal_dosage
      expect(parsed.toxicity.lethal_dosage.ld50).toEqual(["100 mg/kg"]);
    },
    article: {
      title: "Fixtureamine",
      classification: { psychoactive_class: ["Stimulant"], chemical_class: ["Phenethylamine"] },
    },
    buildMessage: buildHarmPotentialMessage,
    assertMessage: (message) => {
      expect(message).toContain("Fixtureamine");
      expect(message).toContain(QUOTES);
      expect(message).toContain("Generate ONLY the harm_potential section");
    },
    update: { harm_potential: { psychosis: { level: "low", description: "desc" } } },
    apply: applyHarmPotentialUpdate,
    assertApplied: (updated) => expect(updated.harm_potential.psychosis.level).toBe("low"),
  },
  {
    section: "dosage-duration",
    yaml: `
\`\`\`yaml
dosage:
  routes:
    - route: Oral
      dose_ranges:
        threshold:
          min: 5
          max:
          unit: mg
      notes: ""
duration:
  routes:
    - route: Oral
      stages:
        onset:
          min: 20
          max: 40
          unit: minutes
\`\`\`
`,
    parse: parseDosageDurationYaml,
    assertParsed: (parsed) => {
      expect(parsed.dosage.routes).toHaveLength(1);
      expect(parsed.duration.routes).toHaveLength(1);
    },
    article: {
      title: "Fixtureamine",
      identification: { common_name: "Fixtureamine", substitutive_name: "Fixture" },
      classification: { psychoactive_class: ["Stimulant"] },
      dosage: {
        routes: [
          {
            route: "Oral",
            bioavailability: "70%",
            bioavailability_notes: "note",
            dose_ranges: { threshold: { min: 5, max: null, unit: "mg" } },
            notes: "dosage note",
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "Oral",
            half_life: "4h",
            half_life_notes: "half note",
            stages: { onset: { min: 20, max: 40, unit: "minutes" } },
          },
        ],
      },
    },
    buildMessage: buildDosageDurationMessage,
    assertMessage: (message) => {
      expect(message).toContain(QUOTES);
      // pharmacology-owned fields are withheld from the review prompt
      expect(message).not.toContain("bioavailability:");
      expect(message).not.toContain("half_life:");
      expect(message).toContain("dose_ranges:");
      expect(message).toContain("stages:");
    },
    update: { dosage: { routes: [{ route: "Oral" }] }, duration: { routes: [{ route: "Oral" }] } },
    apply: applyDosageDurationUpdate,
    assertApplied: (updated) => {
      expect(updated.dosage.routes[0].route).toBe("Oral");
      expect(updated.duration.routes[0].route).toBe("Oral");
    },
  },
];

describe.each(CASES)("batch $section generator", (testCase) => {
  it("parses the wrapped section yaml", () => {
    testCase.assertParsed(testCase.parse(testCase.yaml));
  });

  it("builds prompt context that carries the quotes and withholds the generated section", () => {
    testCase.assertMessage(testCase.buildMessage(testCase.article, QUOTES));
  });

  it("applies the generated section through the persistence adapter", () => {
    testCase.assertApplied(testCase.apply({ title: "Fixtureamine" }, testCase.update));
  });
});

describe("harm potential normalization", () => {
  it("normalizes generated harm potential structures and invalid enums", () => {
    const normalized = normalizeHarmPotential({
      addiction: {
        psychological: { level: "unsafe", description: "desc" },
        physical_dependence: { level: "moderate", description: "phys" },
      },
      toxicity: {
        lethal_dosage: { notes: "note", ld50: ["100 mg/kg"] },
        organ_toxicity: ["Kidney strain"],
        carcinogenicity: { level: "bad", evidence: "weak", description: "desc" },
        antibiotic_function: { level: "confirmed", description: "desc" },
      },
      psychosis: { level: "extremely_high", description: "psychosis" },
      seizure: { level: "not-real", description: "seizure" },
    });

    expect(normalized.addiction.psychological.level).toBeNull();
    expect(normalized.addiction.physical_dependence.level).toBe("moderate");
    expect(normalized.toxicity.lethal_dosage.ld50).toEqual(["100 mg/kg"]);
    expect(normalized.toxicity.carcinogenicity.level).toBeNull();
    expect(normalized.toxicity.antibiotic_function.level).toBe("confirmed");
    expect(normalized.psychosis.level).toBe("extremely_high");
    expect(normalized.seizure.level).toBeNull();
  });
});

describe("dosage-duration merge", () => {
  it("preserves pharmacology-owned route fields when merging generated output", () => {
    const logger = { log: vi.fn() };
    const merged = mergeGeneratedWithExisting(
      {
        dosage: {
          routes: [
            {
              route: "Oral",
              bioavailability: "70%",
              bioavailability_notes: "existing note",
              dose_ranges: {},
              notes: "legacy dosage note",
            },
            {
              route: "Intranasal",
              bioavailability: "50%",
              bioavailability_notes: "",
              dose_ranges: {},
              notes: "keep entire route",
            },
          ],
        },
        duration: {
          routes: [
            {
              route: "Oral",
              half_life: "4h",
              half_life_notes: "existing half-life note",
              stages: {},
            },
            {
              route: "Intranasal",
              half_life: "3h",
              half_life_notes: "",
              stages: {},
            },
          ],
        },
      },
      {
        routes: [
          {
            route: "Oral",
            dose_ranges: { threshold: { min: 5, max: null, unit: "mg" } },
            notes: "generated note",
          },
        ],
        plateau_dosing: null,
      },
      {
        routes: [
          {
            route: "Oral",
            stages: { onset: { min: 20, max: 40, unit: "minutes" } },
          },
        ],
      },
      logger,
    );

    expect(merged.dosage.routes[0]).toMatchObject({
      route: "Oral",
      bioavailability: "70%",
      bioavailability_notes: "existing note",
      notes: "generated note",
    });
    expect(merged.duration.routes[0]).toMatchObject({
      route: "Oral",
      half_life: "4h",
      half_life_notes: "existing half-life note",
    });
    expect(merged.dosage.routes[1].route).toBe("Intranasal");
    expect(merged.duration.routes[1].route).toBe("Intranasal");
    expect(logger.log).toHaveBeenCalledTimes(2);
  });
});
