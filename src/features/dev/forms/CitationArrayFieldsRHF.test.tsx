import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";
import { CitationArrayFieldsRHF } from "./CitationArrayFieldsRHF";

function renderCitationFields(name: "source_citations" | "citations") {
  const onSubmit = vi.fn();

  function Harness() {
    const methods = useForm<SubstanceArticle>({
      defaultValues: {
        source_citations: [{ name: "PsychonautWiki", url: "https://psychonautwiki.org" }],
        citations: [{ name: "TripSit", url: "https://tripsit.me" }],
      } as SubstanceArticle,
    });
    const items = useFieldArray({ control: methods.control, name });

    return (
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)}>
          <CitationArrayFieldsRHF
            items={items}
            name={name}
            roleLabel={name}
            itemLabel="Citation"
            addLabel="Add citation"
            nameLabel="Citation label"
            urlLabel="Citation URL"
            namePlaceholder="TripSit"
            onAdd={() => items.append({ name: "", url: "" })}
            onRemove={(index) => items.remove(index)}
            icon="lucide:library"
          />
          <button type="submit">Save</button>
        </form>
      </FormProvider>
    );
  }

  render(<Harness />);
  return onSubmit;
}

describe("CitationArrayFieldsRHF", () => {
  it("associates each citation control with its label", () => {
    renderCitationFields("citations");

    expect(screen.getByLabelText("Citation label")).toHaveValue("TripSit");
    expect(screen.getByLabelText("Citation URL")).toHaveValue("https://tripsit.me");
  });

  it("preserves the source_citations raw shape", async () => {
    const onSubmit = renderCitationFields("source_citations");
    fireEvent.change(screen.getByDisplayValue("PsychonautWiki"), {
      target: { value: "Erowid" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          source_citations: [{ name: "Erowid", url: "https://psychonautwiki.org" }],
        }),
        expect.anything(),
      );
    });
  });

  it("preserves the citations raw shape", async () => {
    const onSubmit = renderCitationFields("citations");
    fireEvent.change(screen.getByDisplayValue("TripSit"), {
      target: { value: "Further reading" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          citations: [{ name: "Further reading", url: "https://tripsit.me" }],
        }),
        expect.anything(),
      );
    });
  });
});
