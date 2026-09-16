import { describe, expect, it } from "vitest";

import { validateArticleForIngestion } from "../../server/lib/validators";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { FIELD_PATHS } from "@/data/schema/fieldRegistry.generated";
import {
  substanceArticleSchema,
  validateSubstanceArticleContract,
} from "@/schema";
import { minimalArticle } from "@/test/fixtures/articles";

describe("substance article contract", () => {
  it("accepts the same valid article through frontend and Postgres-facing adapters", () => {
    expect(substanceArticleSchema.safeParse(minimalArticle).success).toBe(true);
    expect(validateSubstanceArticleContract(minimalArticle)).toMatchObject({ ok: true });
    expect(validateArticleForIngestion(minimalArticle)).toMatchObject({
      ok: true,
      article: minimalArticle,
    });
  });

  it("reports invalid canonical binding-site fields before Postgres storage", () => {
    const invalidArticle = {
      ...minimalArticle,
      pharmacology: {
        ...minimalArticle.pharmacology,
        binding_sites: [
          {
            target: "5-HT2A",
            tag: 42,
          },
        ],
      },
    };

    const validation = validateArticleForIngestion(invalidArticle);

    expect(validation.ok).toBe(false);
    if (validation.ok === false) {
      expect(validation.issues).toContain(
        "pharmacology.binding_sites.0.tag: Invalid input: expected string, received number",
      );
    }
  });

  it("rejects legacy storage writes after the read-compatible widening stage", () => {
    const { binding_sites: _bindingSites, ...pharmacology } = minimalArticle.pharmacology;
    const validation = validateArticleForIngestion({
      ...minimalArticle,
      pharmacology: {
        ...pharmacology,
        receptor_profile: [{ receptor: "SERT", affinity: "Ki = 6.3 nM" }],
      },
    });

    expect(validation.ok).toBe(false);
  });

  it("keeps generated schema helpers compatible with the article contract", () => {
    const emptyArticle = createEmptyArticle();

    expect(validateSubstanceArticleContract(emptyArticle)).toMatchObject({ ok: true });
    expect(FIELD_PATHS).toContain("pharmacology.binding_sites");
    expect(FIELD_PATHS).not.toContain("pharmacology.receptor_profile");
    expect(FIELD_PATHS).toContain("dosage.routes[].dose_ranges.threshold");
    expect(FIELD_PATHS).toContain("references");
    expect(FIELD_PATHS).toContain("dosage.routes[].reference_ids");
    expect(FIELD_PATHS).toContain("duration.routes[].reference_ids");
  });
});
