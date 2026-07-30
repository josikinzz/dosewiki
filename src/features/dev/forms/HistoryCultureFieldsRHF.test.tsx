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
            subsections: [
              { heading: "Hofmann", content: "" },
              { heading: "Sandoz", content: "" },
            ],
          },
          { heading: "Prohibition", content: "", subsections: [] },
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
  it("names the section and its subsection count in the confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Remove section 1"));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Remove "Discovery" and its 2 subsections? This cannot be undone.',
    );
    expect(screen.getAllByLabelText("Section Heading")).toHaveLength(2);
  });

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
});
