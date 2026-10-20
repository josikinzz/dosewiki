import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "../../src/schema";
import { projectLibraryInput } from "../../src/data/projections/substanceReadProjections";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { createDataPublicDataReadAdapter } from "./publicData.reads";
import {
  parsePublicSubstanceLibraryInputRecord,
  parsePublicSubstanceLibraryInputRecords,
  parsePublicSubstanceRecord,
  parsePublicSubstanceRecords,
  PublicSubstanceContractError,
} from "./publicData.substanceContract";

const safetyDosageRoute = {
  route: "Sublingual",
  bioavailability: "71%",
  bioavailability_notes: "Varies by blotter.",
  dose_ranges: {
    threshold: { min: 15, max: null, unit: "μg" },
    light: { min: 25, max: 75, unit: "μg" },
    moderate: { min: 75, max: 150, unit: "μg" },
    strong: { min: 150, max: 300, unit: "μg" },
    heavy: { min: 300, max: null, unit: "μg" },
  },
  notes: "Start low; potency varies between batches.",
  reference_ids: ["ref-dose-1", "ref-dose-2"],
};

const safetyInteractions = {
  dangerous: ["Lithium", "Tramadol"],
  unsafe: ["Cannabis"],
  caution: ["MDMA"],
};

const safetyLegality = {
  international: ["Schedule I (UN)"],
  countries: {
    "United Kingdom": {
      status: "Class A",
      notes: "Controlled under the Misuse of Drugs Act 1971.",
      canonicalStatus: "prohibited" as const,
    },
    Portugal: {
      status: "Decriminalized",
      notes: "Personal possession is an administrative offence.",
      canonicalStatus: "decriminalized" as const,
    },
  },
};

function safetyArticle(slug = "lsd"): SubstanceArticle & { slug: string } {
  return {
    ...structuredClone(fullArticleWithDosage),
    slug,
    dosage: { routes: [structuredClone(safetyDosageRoute)], plateau_dosing: null },
    interactions: structuredClone(safetyInteractions),
    legality: structuredClone(safetyLegality),
  };
}

function withInvalidDoseBound(slug: string) {
  const article: Record<string, unknown> = safetyArticle(slug);
  const route = structuredClone(safetyDosageRoute) as Record<string, unknown>;
  route.dose_ranges = {
    ...safetyDosageRoute.dose_ranges,
    light: { min: "25", max: 75, unit: "μg" },
  };
  article.dosage = { routes: [route], plateau_dosing: null };
  return article;
}

function captureContractError(run: () => unknown): PublicSubstanceContractError {
  try {
    run();
  } catch (error) {
    if (error instanceof PublicSubstanceContractError) return error;
    throw error;
  }
  throw new Error("expected a PublicSubstanceContractError");
}

describe("public substance article contract", () => {
  it("validates public article records and strips editor-only metadata", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: {
        status: "needed",
        notes: "internal",
      },
    });

    expect(result).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
    });
    expect(result).not.toHaveProperty("editorial_review");
  });

  it("exposes a public-safe expert_reviewed flag derived from a completed review", () => {
    const reviewed = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: { status: "completed", notes: "internal" },
    });

    expect(reviewed).toMatchObject({ slug: "lsd", expert_reviewed: true });
    expect(reviewed).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(reviewed)).not.toContain("internal");

    const pending = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: { status: "in_progress", notes: "" },
    });

    expect(pending).toMatchObject({ expert_reviewed: false });
  });

  it("preserves dose bounds, units, notes, reference ids, interaction buckets, and legality exactly", () => {
    const result = parsePublicSubstanceRecord(safetyArticle());

    expect(result.dosage.routes).toEqual([safetyDosageRoute]);
    expect(result.interactions).toEqual(safetyInteractions);
    expect(result.legality.international).toEqual(safetyLegality.international);
    expect(result.legality.countries).toEqual(safetyLegality.countries);
  });

  it("rejects an invalid dose bound with the slug and schema path instead of returning null", () => {
    const error = captureContractError(() => parsePublicSubstanceRecord(withInvalidDoseBound("lsd")));

    expect(error.slug).toBe("lsd");
    expect(error.issuePaths).toContain("dosage.routes.0.dose_ranges.light.min");
    expect(error.message).toContain('slug "lsd"');
    expect(error.message).toContain("dosage.routes.0.dose_ranges.light.min");
  });

  it("rejects malformed interaction buckets and legality statuses", () => {
    const interactions = captureContractError(() =>
      parsePublicSubstanceRecord({
        ...safetyArticle("tramadol"),
        interactions: { ...safetyInteractions, dangerous: "Lithium" },
      }),
    );
    expect(interactions.slug).toBe("tramadol");
    expect(interactions.issuePaths).toContain("interactions.dangerous");

    const legality = captureContractError(() =>
      parsePublicSubstanceRecord({
        ...safetyArticle("mdma"),
        legality: {
          ...safetyLegality,
          countries: {
            Portugal: { status: "Decriminalized", notes: "", canonicalStatus: "banned" },
          },
        },
      }),
    );
    expect(legality.slug).toBe("mdma");
    expect(legality.issuePaths).toContain("legality.countries.Portugal.canonicalStatus");
  });

  it("fails the whole bulk read instead of publishing a smaller corpus", () => {
    const error = captureContractError(() =>
      parsePublicSubstanceRecords([safetyArticle("lsd"), withInvalidDoseBound("2c-b")]),
    );

    expect(error.slug).toBe("2c-b");
    expect(parsePublicSubstanceRecords([])).toEqual([]);
  });

  it("returns null only when the database row is absent", async () => {
    const absent = createDataPublicDataReadAdapter(async () => null as never);
    await expect(absent.getPublicSubstanceBySlug("missing")).resolves.toBeNull();

    const invalid = createDataPublicDataReadAdapter(async () => withInvalidDoseBound("lsd") as never);
    await expect(invalid.getPublicSubstanceBySlug("lsd")).rejects.toBeInstanceOf(
      PublicSubstanceContractError,
    );
  });
});

describe("public substance library input contract", () => {
  it("keeps dose, duration, and interaction values and drops fields outside the library subset", () => {
    const article = safetyArticle();
    const result = parsePublicSubstanceLibraryInputRecord(projectLibraryInput(article));

    expect(result.dosage.routes).toEqual([
      {
        route: safetyDosageRoute.route,
        dose_ranges: safetyDosageRoute.dose_ranges,
        bioavailability: safetyDosageRoute.bioavailability,
        notes: safetyDosageRoute.notes,
      },
    ]);
    expect(result.duration.routes).toEqual(
      article.duration.routes.map(({ route, stages }) => ({ route, stages })),
    );
    expect(result.interactions).toEqual(safetyInteractions);
    expect(result).not.toHaveProperty("legality");
  });

  it("rejects an invalid library record in scalar and bulk parsing", () => {
    const invalid = { ...projectLibraryInput(safetyArticle("lsd")), interactions: { dangerous: [] } };

    const scalar = captureContractError(() => parsePublicSubstanceLibraryInputRecord(invalid));
    expect(scalar.slug).toBe("lsd");
    expect(scalar.issuePaths).toContain("interactions.unsafe");

    const bulk = captureContractError(() =>
      parsePublicSubstanceLibraryInputRecords([projectLibraryInput(safetyArticle("dmt")), invalid]),
    );
    expect(bulk.slug).toBe("lsd");
  });
});
