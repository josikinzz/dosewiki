import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stable identity, like Next's real useRouter — the explorer's hash-sync
// effect depends on it.
const { router, routerReplace } = vi.hoisted(() => {
  const routerReplace = vi.fn();
  return { router: { replace: routerReplace }, routerReplace };
});

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span aria-hidden="true" data-icon={icon} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { EffectsIndexExplorer } from "./EffectsIndexExplorer";

beforeEach(() => {
  routerReplace.mockClear();
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
    // The gallery used to be a tab here, addressed as /effects#gallery, and that
    // address is in circulation. It now lives at /replications.
    window.location.hash = "#gallery";

    try {
      render(
        <EffectsIndexExplorer
          effects={visualAmplificationEffects}
          effectHrefPrefix="/effects/"
        />,
      );

      await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/replications"));

      // The redirect leaves the rendered view alone rather than blanking it.
      expect(screen.getByRole("tab", { name: "All Effects" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    } finally {
      window.location.hash = "";
    }
  });

  it("keeps the default tab when the fragment is not a tab id", () => {
    window.location.hash = "#visual-gamma";

    try {
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
    } finally {
      window.location.hash = "";
    }
  });

  describe("fragment changes while the page is already mounted", () => {
    // This is the case a mount-only read missed: a fragment link followed from this page does
    // not remount it, and Next resolves hash-only navigations with `history.pushState`, which
    // fires no event. The browser's own fragment navigation is what notifies the page.
    const selectedTab = () =>
      screen
        .getAllByRole("tab")
        .find((tab) => tab.getAttribute("aria-selected") === "true")
        ?.textContent;

    const navigateToFragment = async (fragment: string) => {
      window.location.hash = fragment;
      await waitFor(() => expect(window.location.hash).toBe(fragment));
    };

    afterEach(() => {
      window.location.hash = "";
    });

    it("switches tabs when the fragment changes after mount", async () => {
      render(
        <EffectsIndexExplorer
          effects={visualAmplificationEffects}
          effectHrefPrefix="/effects/"
        />,
      );

      expect(selectedTab()).toBe("All Effects");

      await navigateToFragment("#sensory");
      await waitFor(() => expect(selectedTab()).toBe("Sensory"));

      await navigateToFragment("#cognitive");
      await waitFor(() => expect(selectedTab()).toBe("Cognitive"));

      await navigateToFragment("#physical");
      await waitFor(() => expect(selectedTab()).toBe("Physical"));

      // The retired gallery fragment redirects instead of switching tabs.
      await navigateToFragment("#gallery");
      await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/replications"));
      expect(selectedTab()).toBe("Physical");
    });

    it("returns to the default tab when the reader goes back to a fragmentless entry", async () => {
      render(
        <EffectsIndexExplorer
          effects={visualAmplificationEffects}
          effectHrefPrefix="/effects/"
        />,
      );

      await navigateToFragment("#cognitive");
      await waitFor(() => expect(selectedTab()).toBe("Cognitive"));

      // Back past the first fragment lands on the entry that had none, which rendered the
      // default tab.
      window.location.hash = "";
      await waitFor(() => expect(selectedTab()).toBe("All Effects"));
    });

    it("holds the current tab when an unrecognised fragment arrives", async () => {
      render(
        <EffectsIndexExplorer
          effects={visualAmplificationEffects}
          effectHrefPrefix="/effects/"
        />,
      );

      await navigateToFragment("#physical");
      await waitFor(() => expect(selectedTab()).toBe("Physical"));

      // An in-page anchor — a deep link to an effect, not a tab. It must not blank the view.
      await navigateToFragment("#visual-gamma");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(selectedTab()).toBe("Physical");
    });

    it("re-selects the tab when the fragment already in the URL is asked for again", async () => {
      render(
        <EffectsIndexExplorer
          effects={visualAmplificationEffects}
          effectHrefPrefix="/effects/"
        />,
      );

      await navigateToFragment("#sensory");
      await waitFor(() => expect(selectedTab()).toBe("Sensory"));

      // The reader moves off the tab with the segmented control, leaving #sensory in the URL.
      await userEvent.click(screen.getByRole("tab", { name: "Physical" }));
      expect(selectedTab()).toBe("Physical");

      // Choosing Sensory in the header dropdown again navigates nowhere, so the header
      // announces the fragment itself; the page must honour it.
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      await waitFor(() => expect(selectedTab()).toBe("Sensory"));
    });

    it("stops listening once unmounted", async () => {
      const { unmount } = render(
        <EffectsIndexExplorer
          effects={visualAmplificationEffects}
          effectHrefPrefix="/effects/"
        />,
      );

      unmount();
      await navigateToFragment("#sensory");

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    });
  });
});
