import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
