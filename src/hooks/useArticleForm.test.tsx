import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import { useArticleForm, type UseArticleFormReturn } from "./useArticleForm";

function createArticle(): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    title: "LSD",
    references: [
      {
        id: "ref-1",
        type: "webpage",
        title: "Reference One",
        authors: [],
        url: "https://example.test/ref-1",
        sourceType: "unknown",
        quality: "fallback",
      },
    ],
    dosage: {
      routes: [
        {
          route: "Oral",
          bioavailability: "75%",
          bioavailability_notes: "",
          dose_ranges: {
            threshold: { min: null, max: null, unit: "mg" },
            light: { min: 5, max: 10, unit: "mg" },
            moderate: { min: 10, max: 20, unit: "mg" },
            strong: { min: 20, max: 30, unit: "mg" },
            heavy: { min: 30, max: null, unit: "mg" },
          },
          notes: "",
          reference_ids: ["ref-1"],
        },
      ],
      plateau_dosing: null,
    },
    duration: {
      routes: [
        {
          route: "Oral",
          half_life: "4 hours",
          half_life_notes: "",
          stages: {
            onset: { min: 15, max: 30, unit: "minutes" },
            come_up: { min: 30, max: 60, unit: "minutes" },
            peak: { min: 2, max: 4, unit: "hours" },
            offset: { min: 1, max: 2, unit: "hours" },
            after_effects: { min: 2, max: 4, unit: "hours" },
            total_duration: { min: 4, max: 8, unit: "hours" },
          },
          reference_ids: ["ref-1"],
        },
      ],
    },
  };
}

function UseArticleFormHarness({
  article,
  onReady,
}: {
  article: SubstanceArticle;
  onReady: (form: UseArticleFormReturn) => void;
}) {
  const form = useArticleForm({ article });

  useEffect(() => {
    onReady(form);
  }, [form, onReady]);

  return null;
}

describe("useArticleForm", () => {
  it("preserves references and route reference_ids while syncing duration routes", async () => {
    const article = createArticle();
    let latestForm: UseArticleFormReturn | null = null;

    render(
      <UseArticleFormHarness
        article={article}
        onReady={(form) => {
          latestForm = form;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestForm).not.toBeNull();
    });

    expect(latestForm?.methods.getValues().references).toEqual(article.references);
    expect(latestForm?.methods.getValues("dosage.routes.0.reference_ids")).toEqual(["ref-1"]);
    expect(latestForm?.methods.getValues("duration.routes.0.reference_ids")).toEqual(["ref-1"]);

    act(() => {
      latestForm?.methods.setValue("dosage.routes.0.route", "Sublingual");
    });

    await waitFor(() => {
      expect(latestForm?.methods.getValues("duration.routes.0.route")).toBe("Sublingual");
    });

    expect(latestForm?.methods.getValues().references).toEqual(article.references);
    expect(latestForm?.methods.getValues("dosage.routes.0.reference_ids")).toEqual(["ref-1"]);
    expect(latestForm?.methods.getValues("duration.routes.0.reference_ids")).toEqual(["ref-1"]);
  });
});
