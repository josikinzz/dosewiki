import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Translate } from "@/i18n/messages";
import { EffectIndexArticlePage } from "./EffectIndexArticlePage";

const t: Translate = (text) => text;

describe("EffectIndexArticlePage", () => {
  it("resolves reference links and images across section boundaries", () => {
    render(
      <EffectIndexArticlePage t={t} article={{
        title: "Reference article", tags: [], bodyFormat: "markdown",
        body_raw: "## First\n\n[First source][source]\n\n![Diagram][diagram]\n\n## Second\n\n[Second source][source]\n\n[source]: https://example.com/source\n[diagram]: https://example.com/diagram.png",
      }} />,
    );
    expect(screen.getByRole("link", { name: "First source" })).toHaveAttribute("href", "https://example.com/source");
    expect(screen.getByRole("link", { name: "Second source" })).toHaveAttribute("href", "https://example.com/source");
    expect(screen.getByRole("img", { name: "Diagram" })).toHaveAttribute("src", "https://example.com/diagram.png");
  });

  it("keeps repeated section and nested heading anchors distinct", () => {
    const { container } = render(
      <EffectIndexArticlePage t={t} article={{
        title: "Repeated headings", tags: [],
        body_raw: "[h2]Notes[/h2][h3]Notes[/h3]Nested content.[h2]Notes[/h2]Later content.",
      }} />,
    );
    const ids = [...container.querySelectorAll("section[id], h2[id], h3[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getByRole("heading", { level: 3, name: "Notes" })).toHaveAttribute("id", "notes-3");
    for (const link of container.querySelectorAll<HTMLAnchorElement>('a[href="#notes"], a[href="#notes-2"]')) {
      expect(container.querySelectorAll(link.getAttribute("href")!)).toHaveLength(1);
    }
  });
});
