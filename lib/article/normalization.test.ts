import { describe, expect, it } from "vitest";
import {
  migratePharmacologyBindingSites,
  normalizePharmacologySection,
  planBindingSiteMigration,
  remapBindingSiteEvidencePath,
  remapBindingSiteFieldPath,
} from "./normalization.mjs";

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

describe("planBindingSiteMigration", () => {
  it("reports equivalent dual fields without duplicating entries", () => {
    const plan = planBindingSiteMigration({
      binding_sites: [{ target: "5-HT2A", affinity: "Ki = 2.9 nM" }],
      receptor_profile: [{ receptor: "5-HT2A", affinity: "Ki = 2.9 nM" }],
    });

    expect(plan.status).toBe("equivalent");
    expect(plan.bindingSites).toEqual([
      { target: "5-HT2A", affinity: "Ki = 2.9 nM" },
    ]);
    expect(plan.legacyKeys).toEqual(["receptor_profile"]);
  });

  it("reports conflicting dual fields instead of guessing", () => {
    const plan = planBindingSiteMigration({
      binding_sites: [{ target: "SERT" }],
      receptor_profile: [{ receptor: "DAT" }],
    });

    expect(plan.status).toBe("conflict");
    expect(plan.conflicts).toContain(
      "binding_sites and legacy pharmacology fields contain different entries",
    );
  });

  it("flags mechanism phrases that are not trustworthy targets", () => {
    const plan = planBindingSiteMigration({
      mechanism_of_action: ["prodrug of LSD", "Serotonin releasing agent"],
    });

    expect(plan.status).toBe("legacy");
    expect(plan.suspiciousTargets.map((entry) => entry.target)).toEqual([
      "prodrug of LSD",
      "Serotonin releasing agent",
    ]);
  });
});

describe("migratePharmacologyBindingSites", () => {
  it("canonicalizes empty legacy shells without inventing scientific values", () => {
    expect(
      migratePharmacologyBindingSites({
        bioavailability: null,
        half_life: "",
        mechanism_of_action: [],
        metabolism: null,
        metabolites: [],
        pharmacokinetics: "",
        receptor_profile: [],
      }),
    ).toEqual({
      pharmacodynamics: "",
      half_life: "",
      metabolites: [],
      pharmacokinetics: "",
      binding_sites: [],
    });
  });

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

describe("remapBindingSiteFieldPath", () => {
  it.each([
    [
      "pharmacology.receptor_profile[2].receptor",
      "pharmacology.binding_sites[2].target",
    ],
    [
      "pharmacology.receptor_profile.2.affinity",
      "pharmacology.binding_sites.2.affinity",
    ],
    ["pharmacology.receptor_profile", "pharmacology.binding_sites"],
  ])("remaps the exact structured path %s", (legacyPath, canonicalPath) => {
    expect(remapBindingSiteFieldPath(legacyPath)).toEqual({
      status: "remapped",
      path: canonicalPath,
    });
  });

  it("reports legacy map paths that cannot be indexed safely", () => {
    expect(
      remapBindingSiteFieldPath("pharmacology.receptor_binding.SERT"),
    ).toEqual({
      status: "unmappable",
      path: "pharmacology.receptor_binding.SERT",
      reason: "pharmacology.receptor_binding has no stable binding-site row index",
    });
  });

  it.each([
    [
      "taar1-d-isomer-more-potent",
      "pharmacology.receptor_binding.TAAR1",
      "pharmacology.binding_sites[20].efficacy",
    ],
    [
      "taar1-mechanism-of-action-marker",
      "pharmacology.mechanism_of_action[2]",
      "pharmacology.binding_sites[16].tag",
    ],
  ])("applies the reviewed amphetamine evidence disposition for %s", (claimKey, fieldPath, path) => {
    expect(remapBindingSiteEvidencePath({
      slug: "amphetamine",
      claimKey,
      fieldPath,
    })).toEqual({ status: "remapped", path });
  });

  it("does not guess an unreviewed evidence disposition", () => {
    expect(remapBindingSiteEvidencePath({
      slug: "another-substance",
      claimKey: "taar1-d-isomer-more-potent",
      fieldPath: "pharmacology.receptor_binding.TAAR1",
    })).toEqual({
      status: "unmappable",
      path: "pharmacology.receptor_binding.TAAR1",
      reason: "pharmacology.receptor_binding has no stable binding-site row index",
    });
  });

  it("leaves scientific prose and unrelated paths untouched", () => {
    expect(remapBindingSiteFieldPath("summary.receptor_profile_notes")).toEqual({
      status: "unchanged",
      path: "summary.receptor_profile_notes",
    });
    expect(remapBindingSiteFieldPath("Higher receptor affinity at SERT")).toEqual({
      status: "unchanged",
      path: "Higher receptor affinity at SERT",
    });
  });
});
