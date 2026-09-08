import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle, createEmptyDosageRoute, createEmptyDurationRoute } from "@/data/schema";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";

import { ArticleDraftFormFieldsRHF } from "./ArticleDraftFormFieldsRHF";

vi.mock("@/hooks/useDevTagOptions", () => ({
  useDevTagOptions: () => ({
    categories: [],
    chemicalClasses: [],
    psychoactiveClasses: [],
    mechanismOfAction: [],
    indexCategories: [],
  }),
}));

const article: SubstanceArticle = {
  ...createEmptyArticle(),
  title: "LSD",
};

describe("ArticleDraftFormFieldsRHF", () => {
  it("clears the ref when the form unmounts", () => {
    const formRef = createRef<UseArticleFormReturn | null>() as React.RefObject<
      UseArticleFormReturn | null
    >;

    const { unmount } = render(
      <ArticleDraftFormFieldsRHF idPrefix="article-form" article={article} formRef={formRef} />,
    );
    expect(formRef.current).not.toBeNull();

    unmount();
    expect(formRef.current).toBeNull();
  });

  it("lets an editor add an administration route to an empty article", () => {
    render(<ArticleDraftFormFieldsRHF idPrefix="article-form" article={article} />);

    fireEvent.click(screen.getByRole("button", { name: /Dosage & Duration/ }));

    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(screen.getByLabelText("Administration route")).toBeInTheDocument();
  });

  it("keeps a renamed route focused and submits only its paired labels", async () => {
    const user = userEvent.setup();
    const formRef = createRef<UseArticleFormReturn | null>();
    const seededArticle = {
      ...article,
      dosage: {
        ...article.dosage,
        routes: [{
          ...createEmptyDosageRoute("Inhalation"),
          curated_note: "preserve dosage metadata",
          dose_ranges: {
            ...createEmptyDosageRoute().dose_ranges,
            light: { min: 1, max: 2, unit: "µg", provenance: "synthetic source" },
          },
        }],
      },
      duration: {
        ...article.duration,
        routes: [{
          ...createEmptyDurationRoute("Inhalation"),
          curated_note: "preserve duration metadata",
          stages: {
            ...createEmptyDurationRoute().stages,
            onset: { min: 1, max: 2, unit: "minutes", provenance: "synthetic timing" },
          },
        }],
      },
    };
    render(
      <ArticleDraftFormFieldsRHF idPrefix="rename" article={seededArticle} formRef={formRef} />,
    );
    await user.click(screen.getByRole("button", { name: /Dosage & Duration/ }));
    const expected = structuredClone(formRef.current!.methods.getValues());
    const routeInput = screen.getByLabelText("Administration route");

    await user.clear(routeInput);
    expect(routeInput).toHaveFocus();
    await user.type(routeInput, "Vaporization");
    expect(screen.getByLabelText("Administration route")).toBe(routeInput);
    expect(routeInput).toHaveFocus();
    expect(routeInput).toHaveValue("Vaporization");

    // Merely visiting range inputs must not parse away stored units or metadata.
    await user.click(screen.getByLabelText("Light"));
    await user.click(screen.getByLabelText("Onset"));
    await user.click(routeInput);
    expected.dosage.routes[0].route = "Vaporization";
    expected.duration.routes[0].route = "Vaporization";
    expect(formRef.current!.methods.getValues()).toEqual(expected);

    let submitted: SubstanceArticle | undefined;
    await act(async () => {
      await formRef.current!.methods.handleSubmit((value) => { submitted = value; })();
    });
    expect(submitted).toEqual(expected);
  });

  it("shows copied duration stages and does not let an untouched blur restore stale values", async () => {
    const user = userEvent.setup();
    const formRef = createRef<UseArticleFormReturn | null>();
    const seededArticle = {
      ...article,
      dosage: {
        ...article.dosage,
        routes: [createEmptyDosageRoute("Oral"), createEmptyDosageRoute("Inhalation")],
      },
      duration: {
        ...article.duration,
        routes: [
          {
            ...createEmptyDurationRoute("Oral"),
            stages: { ...createEmptyDurationRoute().stages, onset: { min: 1, max: 2, unit: "hours" } },
          },
          {
            ...createEmptyDurationRoute("Inhalation"),
            stages: { ...createEmptyDurationRoute().stages, onset: { min: 3, max: 4, unit: "minutes" } },
          },
        ],
      },
    };
    render(
      <ArticleDraftFormFieldsRHF idPrefix="copy" article={seededArticle} formRef={formRef} />,
    );
    await user.click(screen.getByRole("button", { name: /Dosage & Duration/ }));
    const onset = screen.getAllByLabelText("Onset")[1];
    expect(onset).toHaveValue("3-4 minutes");
    await user.click(screen.getByRole("button", { name: "Copy duration stages from Oral" }));
    expect(onset).toHaveValue("3-4 minutes");
    await user.click(screen.getByRole("button", { name: "Replace duration stages" }));
    expect(onset).toHaveValue("1-2 hours");
    await user.click(onset);
    await user.click(screen.getAllByLabelText("Administration route")[1]);
    expect(formRef.current!.methods.getValues("duration.routes.1.stages"))
      .toEqual(seededArticle.duration.routes[0].stages);
  });

  it("keeps an absent optional attribution valid when Subjective Effects opens", async () => {
    const formRef = createRef<UseArticleFormReturn | null>() as React.RefObject<
      UseArticleFormReturn | null
    >;
    let validationErrors: unknown = null;

    render(
      <ArticleDraftFormFieldsRHF
        idPrefix="article-form"
        article={article}
        formRef={formRef}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Subjective Effects/ }));
    expect(screen.getByRole("button", { name: /Attribution/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByLabelText("Author")).not.toBeInTheDocument();
    expect(formRef.current?.methods.getValues("subjective_effects.attribution")).toBeUndefined();

    await act(async () => {
      await formRef.current?.methods.handleSubmit(
        () => undefined,
        (errors) => {
          validationErrors = errors;
        },
      )();
    });

    expect(validationErrors).toBeNull();
  });
});
