import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable identity, like Next's real useRouter; the retired #gallery migration
// routes through it without exposing the default index.
const { router, routerReplace } = vi.hoisted(() => {
  const routerReplace = vi.fn();
  return { router: { replace: routerReplace }, routerReplace };
});

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span aria-hidden="true" data-icon={icon} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSelectedLayoutSegments: () => null,
}));

import { EffectsIndexExplorer } from "./EffectsIndexExplorer";

beforeEach(() => {
  routerReplace.mockClear();
  window.history.replaceState({}, "", "/effects");
});

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
  it("renders a routed effect group as the first selected view", () => {
    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
        initialView="cognitive"
      />,
    );

    expect(screen.getByRole("tab", { name: "Cognitive" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("heading", { name: "Visual" })).not.toBeInTheDocument();
  });

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

  it("links a subcategory heading to its own page from the index root", () => {
    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    // Reachable from wherever the subcategory is named, not only from the
    // panel title on the parent category's page.
    expect(screen.getByRole("link", { name: "Amplifications" })).toHaveAttribute(
      "href",
      "/effects/category/visual-amplifications",
    );
  });

  it("keeps the thesis off the All tab and shows it in full on More Info", async () => {
    const user = userEvent.setup();

    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    // The All tab opens straight into the category grid.
    expect(
      screen.queryByText(/is a comprehensive catalogue of/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "More Info" }));

    // The full three-paragraph thesis, with no expander, and no grid below.
    expect(
      screen.getByText(/is a comprehensive catalogue of 4 subjective effects/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/universal terminology for communicating experiences/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/organised into categories based on the senses/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Visual Alpha" })).not.toBeInTheDocument();
  });

  it("opens the Library tab on curated article panels, not on the effect grid", async () => {
    const user = userEvent.setup();

    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Library" }));

    // Each panel is a heading over article rows, and the rows are the archive.
    expect(screen.getByRole("heading", { name: "Intensity scales" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Dissociative Intensity Scale/ }),
    ).toHaveAttribute("href", "/articles/dissociative-intensity-scale");
    expect(screen.getByRole("link", { name: /Lucid dreaming/ })).toHaveAttribute(
      "href",
      "/articles/lucid-dreaming",
    );
    // Curated config, so a filtered effect list must not claim the tab is empty.
    expect(screen.queryByText("No effects found")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Visual Alpha" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(window.location.pathname).toBe("/effects/group/library"),
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

  it("redirects the retired #gallery fragment to /replications", async () => {
    window.history.replaceState({}, "", "/effects#gallery");
    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/replications"));
  });

  it("migrates a legacy tab fragment to its canonical routed view", async () => {
    window.history.replaceState({}, "", "/effects#cognitive");
    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Cognitive" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(window.location.pathname).toBe("/effects/group/cognitive");
    expect(window.location.hash).toBe("");
  });

  it("leaves a real in-page fragment alone", () => {
    window.history.replaceState({}, "", "/effects#visual-gamma");
    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    expect(screen.getByRole("tab", { name: "All Effects" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(window.location.hash).toBe("#visual-gamma");
  });

  it("migrates a legacy fragment announced after mount", async () => {
    render(
      <EffectsIndexExplorer
        effects={visualAmplificationEffects}
        effectHrefPrefix="/effects/"
      />,
    );

    window.history.replaceState({}, "", "/effects#physical");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Physical" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(window.location.pathname).toBe("/effects/group/physical");
    expect(window.location.hash).toBe("");
  });
});
