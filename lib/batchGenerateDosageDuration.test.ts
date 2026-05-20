import { describe, expect, it, vi } from "vitest";

import {
  buildUserMessage,
  mergeGeneratedWithExisting,
} from "../scripts/batch/dosage-duration/lib.mjs";
import { applyDosageDurationUpdate as applyPersistedDosageDurationUpdate } from "../scripts/batch/dosage-duration/persist.mjs";
import { parseGeneratedYaml } from "../scripts/batch/dosage-duration/parser.mjs";

describe("batch dosage-duration helpers", () => {
  it("parses wrapped dosage and duration yaml", () => {
    const parsed = parseGeneratedYaml(`
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
`);

    expect(parsed.dosage.routes).toHaveLength(1);
    expect(parsed.duration.routes).toHaveLength(1);
  });

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

  it("builds review-mode user context without preserved pharmacology-owned fields", () => {
    const message = buildUserMessage(
      {
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
      "quoted material",
    );

    expect(message).toContain("quoted material");
    expect(message).not.toContain("bioavailability:");
    expect(message).not.toContain("half_life:");
    expect(message).toContain("dose_ranges:");
    expect(message).toContain("stages:");
  });

  it("applies generated dosage and duration through the persistence adapter", () => {
    const article = { title: "Fixtureamine" };
    const updated = applyPersistedDosageDurationUpdate(article, {
      dosage: { routes: [{ route: "Oral" }] },
      duration: { routes: [{ route: "Oral" }] },
    });

    expect(updated.dosage.routes[0].route).toBe("Oral");
    expect(updated.duration.routes[0].route).toBe("Oral");
  });
});
