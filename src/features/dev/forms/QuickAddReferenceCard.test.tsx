import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { SubstanceArticle } from "@/schema";

import { detectQuickAddReference, QuickAddReferenceCard } from "./QuickAddReferenceCard";

function renderQuickAdd(defaultReferences: SubstanceArticle["references"] = []) {
  const onSubmit = vi.fn();

  function Harness() {
    const methods = useForm<SubstanceArticle>({
      defaultValues: { references: defaultReferences } as SubstanceArticle,
    });
    const references = useFieldArray({ control: methods.control, name: "references" });

    return (
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)}>
          <QuickAddReferenceCard references={references} />
          <button type="submit">Save</button>
        </form>
      </FormProvider>
    );
  }

  render(<Harness />);
  return onSubmit;
}

describe("QuickAddReferenceCard", () => {
  it("detects supported source inputs and derives stable reference IDs", () => {
    expect(detectQuickAddReference("https://doi.org/10.1000/ABC.1")).toMatchObject({
      kind: "doi",
      id: "doi-10-1000-abc-1",
      doi: "10.1000/abc.1",
      type: "journal_article",
    });
    expect(detectQuickAddReference("pmid:12345")).toMatchObject({
      kind: "pmid",
      id: "pmid-12345",
      pmid: "12345",
    });
    expect(detectQuickAddReference("isbn: 978-0-306-40615-7")).toMatchObject({
      kind: "isbn",
      id: "isbn-9780306406157",
      isbn: "9780306406157",
      type: "book",
    });
    expect(detectQuickAddReference("https://example.com/research?a=1")).toMatchObject({
      kind: "url",
      type: "webpage",
      id: expect.stringMatching(/^url-example-/),
    });
    expect(detectQuickAddReference("A useful source title")).toMatchObject({
      kind: "title",
      type: "webpage",
      id: expect.stringMatching(/^url-source-/),
    });
  });

  it("appends a complete reference with quick-add review defaults", async () => {
    const onSubmit = renderQuickAdd();
    const source = screen.getByLabelText("DOI, PubMed, ISBN, URL, or title");

    fireEvent.change(source, { target: { value: "A useful source title" } });
    fireEvent.blur(source);
    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Authors"), { target: { value: "Author One, Author Two" } });
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2024" } });
    fireEvent.click(screen.getByRole("button", { name: "Add citation" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          references: [expect.objectContaining({
            id: detectQuickAddReference("A useful source title")?.id,
            type: "webpage",
            title: "A useful source title",
            authors: ["Author One", "Author Two"],
            year: 2024,
            sourceType: "unknown",
            quality: "fallback",
            supportStatus: "needs_review",
          })],
        }),
        expect.anything(),
      );
    });
  });

  it("does not append an existing stable ID", async () => {
    const duplicate = detectQuickAddReference("Existing title")!;
    const onSubmit = renderQuickAdd([{
      id: duplicate.id,
      type: "webpage",
      title: "Existing title",
      authors: [],
      sourceType: "unknown",
      quality: "fallback",
    }]);
    const source = screen.getByLabelText("DOI, PubMed, ISBN, URL, or title");

    fireEvent.change(source, { target: { value: "Existing title" } });
    fireEvent.blur(source);

    expect(screen.getByRole("button", { name: "Add citation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ references: [expect.objectContaining({ id: duplicate.id })] }),
        expect.anything(),
      );
    });
  });

  it("recognizes the same URL under an older id and copies the stored marker", async () => {
    const user = userEvent.setup();
    renderQuickAdd([{
      id: "canonical-source",
      type: "webpage",
      title: "Existing source",
      authors: [],
      url: "https://example.test/source/",
      sourceType: "unknown",
      quality: "fallback",
    }]);

    await user.type(
      screen.getByLabelText("DOI, PubMed, ISBN, URL, or title"),
      "https://example.test/source",
    );

    expect(screen.getByRole("button", { name: "Add citation" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Copy tag" }));
    expect(await navigator.clipboard.readText()).toBe("[cite:canonical-source]");
  });
});
