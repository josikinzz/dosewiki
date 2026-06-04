import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { EffectsIndexExplorer } from "./EffectsIndexExplorer";

const visualAmplificationEffects = [
  {
    slug: "visual-alpha",
    name: "Visual Alpha",
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
    slug: "visual-gamma",
    name: "Visual Gamma",
    tags: ["sensory", "visual", "amplification"],
  },
];

describe("EffectsIndexExplorer", () => {
  it("renders capped previews first and reveals the full effect list on demand", async () => {
    const user = userEvent.setup();

    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    expect(screen.getByText("Showing 3 of 4 effects")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visual Alpha" }),
    ).toHaveAttribute("href", "/effects/visual-alpha");
    expect(
      screen.queryByRole("link", { name: "Visual Gamma" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show all Visual Effects" }),
    );

    expect(
      screen.getByRole("link", { name: "Visual Gamma" }),
    ).toHaveAttribute("href", "/effects/visual-gamma");
  });

  it("keeps tab filtering usable with progressive previews", async () => {
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
});
