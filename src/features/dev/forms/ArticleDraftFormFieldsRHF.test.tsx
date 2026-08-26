import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
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
  it("renders a real form element so the resolver has a submit path", () => {
    const { container } = render(
      <ArticleDraftFormFieldsRHF idPrefix="article-form" article={article} />,
    );

    expect(container.querySelector("form")).not.toBeNull();
  });

  it("publishes the form handle on the ref after commit, not during render", () => {
    const formRef = createRef<UseArticleFormReturn | null>() as React.RefObject<
      UseArticleFormReturn | null
    >;
    let refDuringRender: UseArticleFormReturn | null = "unset" as never;

    function Probe() {
      refDuringRender = formRef.current;
      return null;
    }

    render(
      <>
        <ArticleDraftFormFieldsRHF idPrefix="article-form" article={article} formRef={formRef} />
        <Probe />
      </>,
    );

    expect(refDuringRender).toBeNull();
    expect(formRef.current?.methods.getValues("title")).toBe("LSD");
  });

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

  it("feeds the dosage section its route helpers from the form context", () => {
    render(<ArticleDraftFormFieldsRHF idPrefix="article-form" article={article} />);

    fireEvent.click(screen.getByRole("button", { name: /Dosage & Duration/ }));

    expect(screen.getByRole("button", { name: "Add route" })).toBeInTheDocument();
    expect(screen.getByLabelText("Administration route")).toBeInTheDocument();
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
