import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileBioMarkdown } from "./ProfileBioMarkdown";

const richProfileMarkdown = [
  "Contributor paragraph with **strong context** and [a source](https://example.com).",
  "",
  "- First focus",
  "- Second focus",
  "",
  "1. Step one",
  "2. Step two",
  "",
  "> A careful note from the contributor profile.",
].join("\n");

describe("ProfileBioMarkdown", () => {
  it("renders contributor markdown as emphasis, links, lists and quotes", () => {
    render(<ProfileBioMarkdown content={richProfileMarkdown} />);

    const emphasis = screen.getByText("strong context");
    expect(emphasis.tagName).toBe("STRONG");
    // `.theme-accent-emphasis` is the documented prose-emphasis contract
    // (docs/design/ui-kit.md, "Prose emphasis").
    expect(emphasis).toHaveClass("theme-accent-emphasis");

    const link = screen.getByRole("link", { name: "a source" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    const lists = screen.getAllByRole("list");
    expect(lists.map((list) => list.tagName)).toEqual(["UL", "OL"]);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "First focus",
      "Second focus",
      "Step one",
      "Step two",
    ]);

    expect(
      screen.getByText("A careful note from the contributor profile.").closest("blockquote"),
    ).toBeInTheDocument();
  });

  it("keeps single newlines as visible line breaks", () => {
    const { container } = render(
      <ProfileBioMarkdown content={"First line\nSecond line"} />,
    );

    const paragraph = container.querySelector("p");
    expect(paragraph?.querySelector("br")).toBeInTheDocument();
    expect(paragraph).toHaveTextContent("First line");
    expect(paragraph).toHaveTextContent("Second line");
  });
});
