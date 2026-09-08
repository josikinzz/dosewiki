import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";

import { HistoryCultureFieldsRHF } from "./HistoryCultureFieldsRHF";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function Harness() {
  const methods = useForm<SubstanceArticle>({
    defaultValues: {
      history_culture: {
        content: "",
        sections: [
          {
            heading: "Discovery",
            content: "",
            date_range: { start: "1943", end: "1970" },
            subsections: [
              { heading: "Hofmann", content: "Original historical paragraph.", date_range: { start: "1945", end: "1960" } },
              { heading: "Sandoz", content: "" },
            ],
          },
          { heading: "Prohibition", content: "", date_range: { start: "1980", end: "2000" }, subsections: [] },
        ],
      },
    } as unknown as SubstanceArticle,
  });

  return (
    <FormProvider {...methods}>
      <HistoryCultureFieldsRHF idPrefix="history" />
    </FormProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryCultureFieldsRHF section removal", () => {

  it("keeps the section when the confirm is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove section 2"));

    expect(screen.getAllByLabelText("Section Heading")).toHaveLength(2);
  });

  it("removes the section once the confirm is accepted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove section 1"));

    const headings = screen.getAllByLabelText("Section Heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveValue("Prohibition");
  });

  it("preserves a populated subsection when removal is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove subsection 1"));

    expect(screen.getAllByLabelText("Subsection Heading")[0]).toHaveValue("Hofmann");
    expect(screen.getAllByLabelText("Subsection Content")[0]).toHaveValue("Original historical paragraph.");
  });

  it("starts a replacement subsection without the removed dates or prose", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove subsection 2"));
    fireEvent.click(screen.getByLabelText("Remove subsection 1"));
    fireEvent.click(screen.getAllByRole("button", { name: "Add subsection (for notable individuals, etc.)" })[0]);

    expect(screen.getByLabelText("Subsection Heading")).toHaveValue("");
    expect(screen.getByLabelText("Subsection Content")).toHaveValue("");
    expect(screen.getAllByLabelText("Start Date (optional)")[1]).toHaveValue("");
    expect(screen.getAllByLabelText("End Date (optional)")[1]).toHaveValue("");
  });

  it("starts a replacement section without the removed section's dates", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove section 1"));
    fireEvent.click(screen.getByRole("button", { name: "Add Section" }));

    expect(screen.getAllByLabelText("Section Heading")[1]).toHaveValue("");
    expect(screen.getAllByLabelText("Start Date (optional)")[1]).toHaveValue("");
    expect(screen.getAllByLabelText("End Date (optional)")[1]).toHaveValue("");
  });
});
