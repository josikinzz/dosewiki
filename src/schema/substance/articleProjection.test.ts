import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { fullArticleWithDosage, minimalArticle } from "@/test/fixtures/articles";
import type { SubstanceArticle } from "./article";
import {
  projectSubstanceArticle,
  projectSubstanceArticleForEditor,
} from "./articleProjection";

describe("article projection", () => {
  it("normalizes the generated empty article into stable public projections", () => {
    const projection = projectSubstanceArticle(createEmptyArticle());

    expect(projection.identity).toMatchObject({
      id: null,
      displayName: null,
      candidateNames: [],
    });
    expect(projection.taxonomy).toEqual({
      indexCategories: [],
      chemicalClasses: [],
      psychoactiveClasses: [],
    });
    expect(projection.routes).toEqual({ dosage: [], duration: [] });
    expect(projection.pharmacology.mechanismTags).toEqual([]);
    expect(projection.citations).toEqual({ source: [], supporting: [] });
    expect(projection.sectionAvailability).toEqual({
      routes: false,
      pharmacology: false,
      interactions: false,
      harmPotential: true,
      citations: false,
    });
  });

  it("projects current article identity, taxonomy, routes, citations, and availability", () => {
    const projection = projectSubstanceArticle(fullArticleWithDosage);

    expect(projection.identity).toMatchObject({
      id: 42,
      displayName: "LSD",
      commonName: "LSD",
    });
    expect(projection.taxonomy).toEqual({
      indexCategories: ["Psychedelics", "Research Chemicals"],
      chemicalClasses: ["Lysergamide"],
      psychoactiveClasses: ["Psychedelic"],
    });
    expect(projection.routes.dosage).toHaveLength(1);
    expect(projection.routes.duration).toHaveLength(1);
    expect(projection.pharmacology.mechanismTags).toEqual([
      "5-HT2A receptor agonist",
    ]);
    expect(projection.citations.supporting).toEqual([
      {
        label: "PsychonautWiki",
        href: "https://psychonautwiki.org/wiki/LSD",
      },
    ]);
    expect(projection.sectionAvailability).toMatchObject({
      routes: true,
      pharmacology: true,
      interactions: true,
      harmPotential: true,
      citations: true,
    });
  });

  it("centralizes legacy pharmacology compatibility reads", () => {
    const legacyArticle = {
      ...minimalArticle,
      pharmacology: {
        mechanism_of_action: ["5-HT2A receptor agonist"],
        receptor_binding: { "NMDA receptor": "antagonist" },
        metabolism: "Hepatic metabolism.",
        metabolites: [],
        half_life: "3-4 hours",
      },
    } as unknown as SubstanceArticle;

    const projection = projectSubstanceArticle(legacyArticle);

    expect(projection.pharmacology.mechanismTags).toEqual([
      "5-HT2A receptor agonist",
    ]);
    expect(projection.pharmacology.normalized.binding_sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "5-HT2A",
          tag: "5-HT2A receptor agonist",
        }),
        expect.objectContaining({
          target: "NMDA receptor",
          efficacy: "antagonist",
        }),
      ]),
    );
    expect(projection.pharmacology.normalized.pharmacokinetics).toBe(
      "Hepatic metabolism.",
    );
    expect(projection.pharmacology.halfLife).toBe("3-4 hours");
  });

  it("tolerates partial generated shapes without leaking undefined lists", () => {
    const partialArticle = {
      ...minimalArticle,
      index_categories: [" Hidden ", ""],
      classification: {
        psychoactive_class: [" Psychedelic ", ""],
      },
      interactions: {
        dangerous: [" Lithium ", ""],
      },
      source_citations: [{ name: " Source ", url: "" }],
      citations: [{ name: "", url: "https://example.test/ignored" }],
    } as unknown as SubstanceArticle;

    const projection = projectSubstanceArticle(partialArticle);

    expect(projection.taxonomy).toEqual({
      indexCategories: ["Hidden"],
      chemicalClasses: [],
      psychoactiveClasses: ["Psychedelic"],
    });
    expect(projection.interactions).toEqual({
      dangerous: ["Lithium"],
      unsafe: [],
      caution: [],
    });
    expect(projection.citations).toEqual({
      source: [{ label: "Source" }],
      supporting: [],
    });
    expect(projection.sectionAvailability.interactions).toBe(true);
  });

  it("treats structured references as the primary citations presence signal and legacy arrays as fallback leftovers", () => {
    const article = {
      ...minimalArticle,
      references: [
        {
          id: "paper-one",
          type: "webpage",
          title: "Paper One",
          authors: [],
          url: "https://example.test/paper",
          sourceType: "unknown",
          quality: "fallback",
        },
      ],
      source_citations: [{ name: "Duplicate", url: "https://example.test/paper/" }],
      citations: [{ name: "Further", url: "https://example.test/further" }],
    } as unknown as SubstanceArticle;

    const projection = projectSubstanceArticle(article);

    expect(projection.citations).toEqual({
      source: [],
      supporting: [{ label: "Further", href: "https://example.test/further" }],
    });
    expect(projection.sectionAvailability.citations).toBe(true);
  });

  it("adds editor-only metadata only to the editor projection", () => {
    const projection = projectSubstanceArticleForEditor(minimalArticle);

    expect(projection.identity.displayName).toBe("Test Substance");
    expect(projection.editorialReview).toEqual(minimalArticle.editorial_review);
  });
});
