import { describe, expect, it } from "vitest";
import { collectCitationIdsFromPublicRenderOrder } from "./citationPlacement.mjs";

function dosageRoute(route: string, fields: Record<string, unknown> = {}) {
  return {
    route,
    bioavailability: "",
    bioavailability_notes: "",
    notes: "",
    dose_ranges: { light: { min: 1, max: 2, unit: "mg" } },
    ...fields,
  };
}

function durationRoute(route: string, fields: Record<string, unknown> = {}) {
  return {
    route,
    half_life: "",
    half_life_notes: "",
    stages: { total: { min: 4, max: 6, unit: "hours" } },
    ...fields,
  };
}

function article(dosageRoutes: unknown[], durationRoutes: unknown[] = []) {
  return {
    summary: "Summary claim [cite:s].",
    dosage: { routes: dosageRoutes, plateau_dosing: null },
    duration: { routes: durationRoutes },
    pharmacology: { pharmacodynamics: "Mechanism [cite:p]." },
  };
}

describe("dosage and duration citation render order", () => {
  it("collects a route whose stored name carries surrounding whitespace", () => {
    const ids = collectCitationIdsFromPublicRenderOrder(
      article([dosageRoute(" Oral ", { reference_ids: ["d"], notes: "Note [cite:n]." })]),
    );

    expect(ids).toEqual(["s", "d", "n", "p"]);
  });

  it("merges route aliases into the renderer's canonical route groups", () => {
    const ids = collectCitationIdsFromPublicRenderOrder(
      article(
        [
          dosageRoute("oral", { reference_ids: ["oral-dose"] }),
          dosageRoute("IV", { reference_ids: ["iv-dose"] }),
        ],
        [
          durationRoute("intravenous", { reference_ids: ["iv-duration"] }),
          durationRoute("Oral", { half_life: "Half-life [cite:oral-half-life]." }),
        ],
      ),
    );

    expect(ids).toEqual(["s", "oral-dose", "oral-half-life", "iv-dose", "iv-duration", "p"]);
  });

  it("collects the duplicate route row the renderer shows", () => {
    const ids = collectCitationIdsFromPublicRenderOrder(
      article([
        dosageRoute("Oral", { dose_ranges: {}, reference_ids: ["hidden"] }),
        dosageRoute("Oral", { reference_ids: ["shown"], notes: "Note [cite:shown-note]." }),
      ]),
    );

    expect(ids).toEqual(["s", "shown", "shown-note", "p"]);
  });

  it("keeps summary citations first and numbers dosage evidence before later sections", () => {
    const ids = collectCitationIdsFromPublicRenderOrder(
      article(
        [dosageRoute("Insufflated", { bioavailability: "About half [cite:b] [cite:s]." })],
        [durationRoute("snorted", { half_life: "Two hours", half_life_notes: "Short [cite:h]." })],
      ),
    );

    expect(ids).toEqual(["s", "b", "h", "p"]);
  });
});
