import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileBioMarkdown } from "./ProfileBioMarkdown";

const richProfileMarkdown = [
  "Contributor paragraph with **strong context** and [a source](https://example.com).",
  "",
  "- First focus",
  "- Second focus",
  "",
  "> A careful note from the contributor profile.",
].join("\n");

describe("ProfileBioMarkdown", () => {
  it("renders rich contributor markdown with theme-aware roles", () => {
    const { container } = render(<ProfileBioMarkdown content={richProfileMarkdown} />);

    expect(screen.getByText("strong context")).toHaveClass("theme-accent-emphasis");
    expect(screen.getByRole("link", { name: "a source" })).toHaveClass(
      "theme-profile-markdown-link",
    );
    expect(screen.getByText("First focus").closest("ul")).toHaveClass(
      "theme-profile-markdown-marker",
      "theme-text-secondary",
    );

    const quote = screen
      .getByText("A careful note from the contributor profile.")
      .closest("blockquote");

    expect(quote).toHaveClass("theme-profile-markdown-quote");
    expect(quote?.className).not.toContain("border-l-4");
    expect(container.querySelector(".prose-invert")).toBeNull();
    expect(container.innerHTML.includes(["text", "white"].join("-"))).toBe(false);
  });
});
