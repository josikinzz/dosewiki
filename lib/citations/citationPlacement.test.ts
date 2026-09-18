import { describe, expect, it } from "vitest";

import {
  applyWorkbenchCitationPlacement,
  buildCitationPlacementTargets,
  collectCitationIdsFromPublicRenderOrder,
  getWorkbenchCitationPlacement,
  getWorkbenchCitationSection,
  getWorkbenchCitationSeverity,
} from "./citationPlacement.mjs";

describe("citation placement module", () => {
  it("builds formal citation targets with stable claim keys and merge modes", () => {
    const article = {
      pharmacology: {
        pharmacodynamics: "Dynamics.",
        pharmacokinetics: "Kinetics.",
      },
    };

    expect(buildCitationPlacementTargets({ article, sectionKey: "pharmacology" })).toEqual([
      {
        sectionKey: "pharmacology",
        claimKey: "pharmacology:pharmacology.pharmacodynamics",
        fieldPath: "pharmacology.pharmacodynamics",
        claimText: "Dynamics.",
        mergeMode: "inline_text",
      },
      {
        sectionKey: "pharmacology",
        claimKey: "pharmacology:pharmacology.pharmacokinetics",
        fieldPath: "pharmacology.pharmacokinetics",
        claimText: "Kinetics.",
        mergeMode: "inline_text",
      },
    ]);

    expect(() => buildCitationPlacementTargets({ article, sectionKey: "dosage-duration" })).toThrow(
      "Unknown formal citation section: dosage-duration",
    );
  });

  it("describes and applies workbench claim placement", () => {
    const article: {
      dosage: { routes: Array<{ route: string; reference_ids?: string[] }> };
      duration: { routes: Array<{ route: string; reference_ids?: string[] }> };
      history_culture: { sections: Array<{ content?: string }> };
    } = {
      dosage: { routes: [{ route: "oral" }] },
      duration: { routes: [{ route: "oral" }] },
      history_culture: { sections: [] },
    };
    const changes = [];
    const evidence = {
      claimKey: "use_and_effects.dose_duration",
      fieldPath: "use_and_effects.summary",
      referenceIds: ["pihkal"],
    };

    expect(getWorkbenchCitationPlacement(evidence.claimKey)).toMatchObject({
      section: "dosage_duration",
      severity: "blocking",
      mergeMode: "structured_reference_ids",
    });
    expect(getWorkbenchCitationSection(evidence)).toBe("dosage_duration");
    expect(getWorkbenchCitationSeverity("history.shulgin_synthesis_1974")).toBe("non_blocking");

    expect(applyWorkbenchCitationPlacement(article, changes, evidence)).toBe(true);
    expect(article.dosage.routes[0].reference_ids).toEqual(["pihkal"]);
    expect(article.duration.routes[0].reference_ids).toEqual(["pihkal"]);
  });

  it("collects public citation ids in render order", () => {
    const article = {
      summary: "Summary [cite:summary].",
      dosage: {
        routes: [{ route: "oral", reference_ids: ["dose"], notes: "Dose [cite:dose-note]." }],
        plateau_dosing: { first_plateau: { effects: "Plateau [cite:plateau]." } },
      },
      duration: { routes: [{ route: "oral", reference_ids: ["duration"], half_life: "Half [cite:half]." }] },
      pharmacology: {
        pharmacodynamics: "PD [cite:pd].",
        binding_sites: [
          {
            target: "5-HT2A receptor",
            tag: "Agonist [cite:receptor-tag]",
            affinity: "Ki = 6 nM [cite:receptor-affinity]",
            efficacy: "Partial [cite:receptor-efficacy]",
          },
        ],
        pharmacokinetics: "PK [cite:pk].",
        metabolites: ["Metabolite [cite:metabolite]"],
      },
      interactions: { dangerous: [], unsafe: [], caution: ["MAOIs (Risk [cite:maoi].)"] },
      tolerance: { full_tolerance: "Tolerance [cite:tol].", cross_tolerance: ["Cross [cite:cross]."] },
      harm_potential: { summary: "Harm [cite:harm]." },
      history_culture: { content: "History [cite:history].", sections: [] },
      legality: {
        international: ["Intl [cite:intl]."],
        countries: { US: { notes: "US [cite:us]." } },
        usStatesNote: "State summary [cite:state-summary].",
        usStates: {
          Colorado: {
            status: "Status [cite:co-status].",
            instrument: "Instrument [cite:co-instrument].",
            notes: "Notes [cite:co-notes].",
            cities: {
              Denver: {
                status: "City status [cite:denver-status].",
                instrument: "City instrument [cite:denver-instrument].",
                notes: "City notes [cite:denver-notes].",
              },
            },
          },
        },
      },
    };

    expect(collectCitationIdsFromPublicRenderOrder(article)).toEqual([
      "summary",
      "dose",
      "dose-note",
      "duration",
      "half",
      "plateau",
      "pd",
      "receptor-tag",
      "receptor-affinity",
      "receptor-efficacy",
      "pk",
      "metabolite",
      "maoi",
      "tol",
      "cross",
      "harm",
      "history",
      "intl",
      "us",
      "state-summary",
      "co-status",
      "co-instrument",
      "co-notes",
      "denver-status",
      "denver-instrument",
      "denver-notes",
    ]);
  });
});
