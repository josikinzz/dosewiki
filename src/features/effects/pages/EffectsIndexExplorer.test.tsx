import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span aria-hidden="true" data-icon={icon} />,
}));

import { EffectsIndexExplorer } from "./EffectsIndexExplorer";

const visualAmplificationEffects = [
  {
    slug: "visual-gamma",
    name: "Visual Gamma",
    tags: ["sensory", "visual", "amplification"],
  },
  {
    slug: "visual-beta",
    name: "Visual Beta",
    tags: ["sensory", "visual", "amplification"],
  },
  {
    slug: "visual-delta",
    name: "Visual Delta",
    tags: ["sensory", "visual", "amplification"],
  },
  {
    slug: "visual-alpha",
    name: "Visual Alpha",
    tags: ["sensory", "visual", "amplification"],
  },
];

describe("EffectsIndexExplorer", () => {
  it("renders full effect panels by default and lets the panel collapse", async () => {
    const user = userEvent.setup();

    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    expect(
      screen.getByRole("tablist", { name: "Effect categories" }).closest("[data-nosnippet]"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visual Alpha" }),
    ).toHaveAttribute("href", "/effects/visual-alpha");
    expect(
      screen.getByRole("link", { name: "Visual Gamma" }),
    ).toHaveAttribute("href", "/effects/visual-gamma");
    expect(
      screen.getByRole("link", { name: "Visual 4 items" }),
    ).toHaveAttribute("href", "/effects/category/visual-effects");
    expect(
      screen.getByRole("button", {
        name: "Copy Visual Effects list to clipboard",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("/effects/visual-"))
        .map((link) => link.textContent),
    ).toEqual(["Visual Gamma", "Visual Beta", "Visual Delta", "Visual Alpha"]);

    await user.click(
      screen.getByRole("button", { name: "Collapse Visual Effects category" }),
    );

    const expandButton = screen.getByRole("button", {
      name: "Expand Visual Effects category",
    });
    const contentId = expandButton.getAttribute("aria-controls");

    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId!)).toHaveClass(
      "grid-rows-[0fr]",
      "opacity-0",
    );
  });

  it("keeps tab filtering usable with full panels", async () => {
    const user = userEvent.setup();

    render(
      <EffectsIndexExplorer
        effects={[
          ...visualAmplificationEffects,
          {
            slug: "thought-loop",
            name: "Thought Loop",
            tags: ["cognitive", "psychological state"],
          },
        ]}
        effectHrefPrefix="/effects/"
      />,
    );

    await user.click(screen.getByRole("tab", { name: /cognitive/i }));

    expect(
      screen.getByText(/Cognitive effects are subjective effects/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thought Loop" })).toHaveAttribute(
      "href",
      "/effects/thought-loop",
    );
    expect(
      screen.queryByRole("link", { name: "Visual Alpha" }),
    ).not.toBeInTheDocument();
  });

  it("copies effect category lists from the panel icon action", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Copy Visual Effects list to clipboard",
      }),
    );

    expect(writeText).toHaveBeenCalledWith([
      "### Visual Effects",
      "",
      "#### Amplifications",
      "- Visual Gamma",
      "- Visual Beta",
      "- Visual Delta",
      "- Visual Alpha",
    ].join("\n"));
  });
});
