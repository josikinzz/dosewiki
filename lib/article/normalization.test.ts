import { describe, expect, it } from "vitest";
import { normalizePharmacologySection } from "./normalization.js";

describe("normalizePharmacologySection", () => {
  it("maps legacy pharmacology fields into the current structure", () => {
    const normalized = normalizePharmacologySection({
      mechanism_of_action: [
        "5-HT2A receptor agonist (partial)",
        "Dopamine D2 receptor agonist",
      ],
      receptor_binding: {
        "NMDA receptor": "antagonist",
      },
      metabolism: "Hepatic metabolism via CYP enzymes.",
      metabolites: ["2-Oxo-3-hydroxy-LSD"],
      route_bioavailability: {
        oral: "71%",
      },
      route_half_life: {
        oral: "3 hours",
      },
    });

    expect(normalized.pharmacokinetics).toBe("Hepatic metabolism via CYP enzymes.");
    expect(normalized.metabolites).toEqual(["2-Oxo-3-hydroxy-LSD"]);
    expect(normalized.route_bioavailability).toEqual({ Oral: "71%" });
    expect(normalized.route_half_life).toEqual({ Oral: "3 hours" });
    expect(normalized.receptor_profile).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receptor: "5-HT2A",
          tag: "5-HT2A receptor agonist (partial)",
        }),
        expect.objectContaining({
          receptor: "Dopamine D2",
          tag: "Dopamine D2 receptor agonist",
        }),
        expect.objectContaining({
          receptor: "NMDA receptor",
          efficacy: "antagonist",
        }),
      ]),
    );
  });
});
