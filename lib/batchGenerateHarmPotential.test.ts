import { describe, expect, it } from "vitest";

import {
  buildUserMessage,
  normalizeHarmPotential,
  parseGeneratedYaml,
} from "../scripts/batch/harm-potential/lib.mjs";
import { applyHarmPotentialUpdate } from "../scripts/batch/harm-potential/persist.mjs";

describe("batch harm-potential helpers", () => {
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

  it("parses wrapped harm_potential yaml and supports legacy ld50 arrays", () => {
    const parsed = parseGeneratedYaml(`
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
`);

    expect(parsed.addiction.psychological.level).toBe("low");
    expect(parsed.toxicity.lethal_dosage.ld50).toEqual(["100 mg/kg"]);
  });

  it("builds a lightweight prompt context", () => {
    const message = buildUserMessage(
      {
        title: "Fixtureamine",
        classification: {
          psychoactive_class: ["Stimulant"],
          chemical_class: ["Phenethylamine"],
        },
      },
      "quoted content",
    );

    expect(message).toContain("Fixtureamine");
    expect(message).toContain("quoted content");
    expect(message).toContain("Generate ONLY the harm_potential section");
  });

  it("applies generated harm_potential through the persistence adapter", () => {
    const article = { title: "Fixtureamine" };
    const updated = applyHarmPotentialUpdate(article, {
      harm_potential: { psychosis: { level: "low", description: "desc" } },
    });

    expect(updated.harm_potential.psychosis.level).toBe("low");
  });
});
