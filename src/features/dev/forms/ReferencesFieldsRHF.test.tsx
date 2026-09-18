import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle, createEmptyDosageRoute } from "@/data/schema";
import { useArticleForm, type ArticleFormMethods } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";

import { ArticleFormProvider } from "./ArticleFormContext";
import { ReferencesFieldsRHF } from "./ReferencesFieldsRHF";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("./QuickAddReferenceCard", () => ({
  QuickAddReferenceCard: () => <div>Quick add</div>,
  copyCitationTag: vi.fn(async () => true),
}));

const renderCounts = new Map<string, number>();

vi.mock("./EntryCard", async () => {
  const actual = await vi.importActual<typeof import("./EntryCard")>("./EntryCard");
  return {
    ...actual,
    EntryCard: (props: Parameters<typeof actual.EntryCard>[0]) => {
      const key = String(props.removeLabel ?? "unknown");
      renderCounts.set(key, (renderCounts.get(key) ?? 0) + 1);
      return actual.EntryCard(props);
    },
  };
});

const article: SubstanceArticle = {
  ...createEmptyArticle(),
  references: [
    {
      id: "ref-one",
      type: "webpage",
      title: "One",
      authors: [],
      sourceType: "unknown",
      quality: "fallback",
    },
    {
      id: "ref-two",
      type: "webpage",
      title: "Two",
      authors: [],
      sourceType: "unknown",
      quality: "fallback",
    },
  ] as SubstanceArticle["references"],
};

const citedArticle: SubstanceArticle = {
  ...article,
  summary: "Intro text [cite:ref-one] continues.",
  dosage: {
    ...createEmptyArticle().dosage,
    routes: [
      {
        ...createEmptyDosageRoute(),
        route: "oral",
        reference_ids: ["ref-one"],
      },
    ],
  },
};

let lastFormMethods: ArticleFormMethods | null = null;

function Harness({ article: seededArticle = article }: { article?: SubstanceArticle }) {
  const articleForm = useArticleForm({ article: seededArticle });
  lastFormMethods = articleForm.methods;

  return (
    <FormProvider {...articleForm.methods}>
      <ArticleFormProvider value={articleForm}>
        <ReferencesFieldsRHF />
      </ArticleFormProvider>
    </FormProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReferencesFieldsRHF", () => {
  it("associates every reference control with its label", () => {
    renderCounts.clear();
    render(<Harness />);

    expect(screen.getAllByLabelText("Stable ID")[0]).toHaveValue("ref-one");
    expect(screen.getAllByLabelText("Title")[1]).toHaveValue("Two");
    expect(screen.getAllByLabelText("APA text override")).toHaveLength(2);
  });

  it("does not re-render sibling reference cards when one card's ID changes", () => {
    renderCounts.clear();
    render(<Harness />);

    const secondCardRenders = renderCounts.get("Remove reference 2") ?? 0;

    fireEvent.change(screen.getAllByLabelText("Stable ID")[0], {
      target: { value: "ref-one-edited" },
    });

    expect(screen.getAllByLabelText("Stable ID")[0]).toHaveValue("ref-one-edited");
    expect(renderCounts.get("Remove reference 2")).toBe(secondCardRenders);
    expect(renderCounts.get("Remove reference 1")).toBeGreaterThan(secondCardRenders);
  });

  it("keeps the reference when the removal confirm is declined", () => {
    renderCounts.clear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove reference 1"));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("ref-one"));
    expect(screen.getAllByLabelText("Stable ID")).toHaveLength(2);
  });

  it("removes the reference once the confirm is accepted", () => {
    renderCounts.clear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove reference 1"));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Nothing in the article cites it."));
    const remaining = screen.getAllByLabelText("Stable ID");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveValue("ref-two");
  });

  it("strips inline markers and route reference IDs when removal is accepted", () => {
    renderCounts.clear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness article={citedArticle} />);

    fireEvent.click(screen.getByLabelText("Remove reference 1"));

    // The form hook pairs routes by name, so the seeded dosage route gains a
    // duration twin that inherits its reference_ids — two route references.
    expect(confirmSpy).toHaveBeenCalledWith(
      'Remove "ref-one"? This also deletes 1 inline [cite:...] marker(s) and 2 route reference(s).',
    );
    expect(lastFormMethods?.getValues("summary")).toBe("Intro text continues.");
    expect(lastFormMethods?.getValues("dosage.routes.0.reference_ids")).toEqual([]);
    expect(lastFormMethods?.getValues("duration.routes.0.reference_ids")).toEqual([]);
    expect(screen.getAllByLabelText("Stable ID")).toHaveLength(1);
  });

  it("leaves markers and route references intact when removal is declined", () => {
    renderCounts.clear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness article={citedArticle} />);

    fireEvent.click(screen.getByLabelText("Remove reference 1"));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("2 route reference(s)"));
    expect(lastFormMethods?.getValues("summary")).toBe("Intro text [cite:ref-one] continues.");
    expect(lastFormMethods?.getValues("dosage.routes.0.reference_ids")).toEqual(["ref-one"]);
    expect(lastFormMethods?.getValues("duration.routes.0.reference_ids")).toEqual(["ref-one"]);
    expect(screen.getAllByLabelText("Stable ID")).toHaveLength(2);
  });
});
