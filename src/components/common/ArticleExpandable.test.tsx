import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExpandableList, ExpandableText } from "./ArticleExpandable";

describe("article expandable primitives", () => {
  it("collapses and expands count-based lists", async () => {
    const user = userEvent.setup();

    render(
      <ExpandableList
        ariaLabelBase="sources"
        collapsedCount={1}
        items={["Alpha", "Beta", "Gamma"]}
        renderItem={(item) => <span>{item}</span>}
      />,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "Expand sources" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");

    await user.click(expandButton);

    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sources" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("toggles line-clamped text", async () => {
    const user = userEvent.setup();

    render(
      <ExpandableText ariaLabelBase="legality notes" maxLines={2}>
        Long note text with enough content to represent a collapsed article note.
      </ExpandableText>,
    );

    const content = screen.getByText(/Long note text/);
    expect(content).toHaveAttribute("data-expanded", "false");
    expect(content.getAttribute("style")).toContain("-webkit-line-clamp: 2");

    await user.click(screen.getByRole("button", { name: "Expand legality notes" }));

    expect(content).toHaveAttribute("data-expanded", "true");
    expect(content.getAttribute("style") ?? "").not.toContain(
      "-webkit-line-clamp",
    );
  });
});
