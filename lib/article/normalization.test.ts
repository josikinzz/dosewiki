import { describe, expect, it } from "vitest";
import { migratePharmacologyBindingSites, normalizePharmacologySection } from "./normalization.mjs";

describe("normalizePharmacologySection", () => {
  it("maps legacy pharmacology fields into canonical binding sites", () => {
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
    expect(normalized.binding_sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "5-HT2A",
          tag: "5-HT2A receptor agonist (partial)",
        }),
        expect.objectContaining({
          target: "Dopamine D2",
          tag: "Dopamine D2 receptor agonist",
        }),
        expect.objectContaining({
          target: "NMDA receptor",
          efficacy: "antagonist",
        }),
      ]),
    );
    expect(normalized).not.toHaveProperty("receptor_profile");
    expect(normalized).not.toHaveProperty("receptor_binding");
  });

  it("preserves canonical target values, measurements, and citation markers", () => {
    const normalized = normalizePharmacologySection({
      binding_sites: [
        {
          target: "SERT[cite:sert-paper]",
          tag: "serotonin transporter inhibitor[cite:sert-paper]",
          affinity: "Ki = 6.3 nM[cite:binding-study]",
          efficacy: "Inhibits uptake[cite:uptake-study]",
        },
      ],
      pharmacokinetics: "",
      metabolites: [],
    });

    expect(normalized.binding_sites).toEqual([
      {
        target: "SERT[cite:sert-paper]",
        tag: "serotonin transporter inhibitor[cite:sert-paper]",
        affinity: "Ki = 6.3 nM[cite:binding-study]",
        efficacy: "Inhibits uptake[cite:uptake-study]",
      },
    ]);
  });
});

describe("migratePharmacologyBindingSites", () => {
  it("changes only structural legacy keys and preserves all scientific values", () => {
    const migrated = migratePharmacologyBindingSites({
      pharmacodynamics: "  Keep deliberate spacing.  ",
      receptor_profile: [
        {
          receptor: "SERT[cite:target]",
          affinity: "Ki = 6.3 nM[cite:affinity]",
        },
      ],
      metabolism: "Converted hepatically.[cite:metabolism]",
      metabolites: ["M1[cite:metabolite]"],
      half_life: "3 hours[cite:half-life]",
    });

    expect(migrated).toEqual({
      pharmacodynamics: "  Keep deliberate spacing.  ",
      metabolites: ["M1[cite:metabolite]"],
      half_life: "3 hours[cite:half-life]",
      binding_sites: [
        {
          target: "SERT[cite:target]",
          affinity: "Ki = 6.3 nM[cite:affinity]",
        },
      ],
      pharmacokinetics: "Converted hepatically.[cite:metabolism]",
    });
  });
});
