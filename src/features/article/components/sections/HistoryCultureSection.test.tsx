import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { HistoryCultureSection } from "./HistoryCultureSection";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

describe("HistoryCultureSection", () => {
  it("expands history content and keeps keyword-based heading icon fallback intact", () => {
    const article = {
      ...createEmptyArticle(),
      title: "History Test",
      history_culture: {
        content: "",
        sections: [
          {
            heading: "Discovery in clinical settings",
            content: "1965 ".repeat(180),
            subsections: [],
          },
        ],
      },
    };

    render(<HistoryCultureSection article={article} />);

    expect(screen.getByText("Discovery in clinical settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand history and culture" })).toBeInTheDocument();
    expect(screen.getAllByText("1965").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Expand history and culture" }));

    expect(screen.getByRole("button", { name: "Collapse history and culture" })).toBeInTheDocument();
  });

  it("places notable individuals after the contextual history sections", () => {
    const article = {
      ...createEmptyArticle(),
      title: "History Order Test",
      history_culture: {
        content: "",
        sections: [
          {
            heading: "Discovery and Development",
            content: "First synthesized in 1908.",
            subsections: [],
          },
          {
            heading: "Notable Individuals",
            content: "",
            subsections: [
              {
                heading: "Example Person",
                content: "A documented user.",
              },
            ],
          },
          {
            heading: "Contemporary Use and Availability",
            content: "Current clinical context.",
            subsections: [],
          },
        ],
      },
    };

    render(<HistoryCultureSection article={article} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand history and culture" }));

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Discovery and Development",
      "Contemporary Use and Availability",
      "Notable Individuals",
    ]);
  });
});
