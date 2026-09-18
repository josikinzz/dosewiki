import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { InteractionsSection } from "./InteractionsSection";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

describe("interaction section characterization", () => {
  it("renders interaction severity hierarchy with non-color labels", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Interaction Test",
      interactions: {
        dangerous: ["MAOIs (Potentially life-threatening interaction.)"],
        unsafe: ["Tramadol"],
        caution: ["Cannabis"],
      },
    };

    const { container } = render(<InteractionsSection article={article} />);

    expect(screen.getByText("Highest risk")).toHaveClass("theme-interaction-severity-badge-danger");
    expect(screen.getByText("Avoid")).toHaveClass("theme-interaction-severity-badge-unsafe");
    expect(screen.getByText("Use caution")).toHaveClass("theme-interaction-severity-badge-caution");
    expect(container.querySelector(".theme-interaction-danger")).toBeInTheDocument();

    const expandButton = screen.getByRole("button", {
      name: "Expand MAOIs interaction rationale",
    });
    expect(expandButton).toHaveAttribute("aria-controls", "interaction-maois-dangerous");
    fireEvent.click(expandButton);
    expect(
      screen.getByRole("button", { name: "Collapse MAOIs interaction rationale" }),
    ).toHaveAttribute("aria-controls", "interaction-maois-dangerous");
  });

  it("keeps translated full-width rationale delimiters behind the interaction pill", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Translated Interactions",
      interactions: {
        dangerous: ["酒精（该组合会增强中枢神经系统抑制。）"],
        unsafe: [],
        caution: [],
      },
    };

    render(<InteractionsSection article={article} />);

    expect(screen.getByText("酒精")).toBeInTheDocument();
    expect(screen.queryByText(/该组合会增强/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "Expand 酒精 interaction rationale",
    }));
    expect(screen.getByText("该组合会增强中枢神经系统抑制。")).toBeInTheDocument();
  });

  it("links only interaction substances with canonical public articles", () => {
    const article = {
      ...createEmptyArticle(),
      title: "Interaction Links",
      interactions: {
        dangerous: ["MDMA", "MAOIs (Potentially life-threatening interaction.)"],
        unsafe: [],
        caution: [],
      },
    };

    render(
      <InteractionsSection
        article={article}
        linkableSubstanceSlugs={["mdma"]}
      />,
    );

    expect(screen.getByRole("link", { name: "MDMA" })).toHaveAttribute(
      "href",
      "/mdma",
    );
    expect(screen.queryByRole("link", { name: "MAOIs" })).not.toBeInTheDocument();
    expect(screen.getByText("MAOIs")).toBeInTheDocument();
  });

  it("flags an absent interaction table instead of hiding the section", () => {
    const article = { ...createEmptyArticle(), title: "No Combos" };

    const { container } = render(<InteractionsSection article={article} />);

    // The section keeps its anchor so the table of contents does not lose a row.
    expect(container.querySelector("#interactions")).toBeInTheDocument();
    expect(screen.getByText("Interactions not written up yet")).toBeInTheDocument();
    expect(
      screen.getByText(/unlisted combination is an unknown one/i),
    ).toBeInTheDocument();
    // And it still hands the reader somewhere to go.
    expect(screen.getByRole("link", { name: /TripSit/ })).toHaveAttribute(
      "href",
      "https://combo.tripsit.me/",
    );
  });
});
