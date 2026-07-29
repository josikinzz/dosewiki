import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { AboutPage } from "./AboutPage";

/** Flavored: "Documentation" on dose.wiki, "Licensing & Contact" on Effect Index. */
const docsLabel = SITE_FLAVOR_CONFIG.about.docsTitle;

/**
 * The Open Data tab ships dose.wiki's own exports, so it does not exist on every flavor.
 * Its assertions run only where the tab is owned; the other flavor asserts its absence.
 */
const showOpenData = SITE_FLAVOR_CONFIG.about.showOpenData;
const describeOpenData = showOpenData ? describe : describe.skip;

const founderProfiles: NormalizedUserProfile[] = [
  {
    key: "JOSIE",
    displayName: "Josie Founder",
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  },
  {
    key: "ALEX",
    displayName: "Alex Contributor",
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  },
];

function renderAboutPage() {
  return render(
    <AboutPage
      founderProfiles={founderProfiles}
      previewSnapshots={[]}
      missionContent={<p>Mission test copy for harm reduction.</p>}
      moleculeCount={572}
    />,
  );
}

beforeEach(() => {
  window.history.pushState(null, "", "/about");
});

describe("AboutPage tabs", () => {
  it("shows Mission content by default", () => {
    renderAboutPage();

    expect(screen.getByRole("tab", { name: /mission/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(Boolean(screen.queryByRole("tab", { name: /open data/i }))).toBe(showOpenData);
    expect(screen.getByRole("tab", { name: /contributors/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: docsLabel })).toBeInTheDocument();
    expect(
      screen.getByText("Mission test copy for harm reduction."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /open data/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /founders & contributors/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: docsLabel })).not.toBeInTheDocument();
  });

  it("reveals founder cards when Contributors is selected", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /contributors/i }));

    expect(
      screen.getByRole("heading", { name: /founders & contributors/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /josie founder/i }),
    ).toHaveAttribute("href", "/contributors/josie");
    expect(
      screen.getByRole("link", { name: /alex contributor/i }),
    ).toHaveAttribute("href", "/contributors/alex");
  });

  it("uses hash anchors without making the selected panel the native scroll target", async () => {
    window.history.pushState(null, "", "/about#contributors");

    renderAboutPage();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /contributors/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    const panel = screen.getByRole("tabpanel", {
      name: /founders & contributors/i,
    });
    const hashAnchor = document.getElementById("contributors");

    expect(panel).toHaveAttribute("id", "about-panel-contributors");
    expect(hashAnchor).not.toBeNull();
    expect(hashAnchor).not.toBe(panel);
    expect(hashAnchor?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("reveals this flavor's documentation links when the last tab is selected", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: docsLabel }));

    expect(screen.getByRole("heading", { name: docsLabel })).toBeInTheDocument();

    // The cards are flavored: dose.wiki advertises its `/docs/*` pages, Effect Index its
    // own copyright disclaimer and supporting pages. Asserting the fixed dose.wiki set
    // here would ship a false licensing claim on the other build without failing.
    for (const doc of SITE_FLAVOR_CONFIG.about.docLinks) {
      expect(screen.getByRole("link", { name: new RegExp(doc.title, "i") })).toHaveAttribute(
        "href",
        doc.href,
      );
    }
  });

  it("states this flavor's reuse terms, not the other flavor's", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    // The notice sits under Open Data where that tab exists, and with the licence card
    // where it does not.
    await user.click(
      screen.getByRole("tab", { name: showOpenData ? /open data/i : docsLabel }),
    );

    // dose.wiki dedicates its material to the public domain (CC0); Effect Index licenses
    // it under CC BY-NC-SA. Shipping either claim on the other build would be false.
    const { linkHref, linkLabel } = SITE_FLAVOR_CONFIG.about.reuseNotice;
    expect(linkLabel).toBe(isEffectIndex() ? "CC BY-NC-SA 4.0" : "CC0");
    expect(screen.getByRole("link", { name: linkLabel })).toHaveAttribute("href", linkHref);
  });
});

describeOpenData("AboutPage public export contract", () => {
  it("reveals open data and download tooling when Open Data is selected", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /open data/i }));

    expect(
      screen.getByRole("heading", { name: /open data/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("SubstanceIndex.json")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /github repository/i }),
    ).toHaveAttribute("href", "https://github.com/josikinzz/dosewiki");
    expect(
      screen.getByRole("heading", { name: /molecule art pack/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("molecules.json")).toBeInTheDocument();
  });

  it("keeps archival snapshot actions without the removed explanatory heading", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /open data/i }));

    expect(screen.queryByText("Download archival snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/Convex is the live runtime source/i)).not.toBeInTheDocument();
    expect(screen.getByText("Static JSON snapshot")).toBeInTheDocument();
    expect(screen.getByText("GitHub Repository")).toBeInTheDocument();
    expect(screen.queryByText("Full database export")).not.toBeInTheDocument();
  });
});

describe("AboutPage cross-publication content", () => {
  it("never ships another publication's exports or repository", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    const seen = new Set<string>();

    for (const tab of screen.getAllByRole("tab")) {
      await user.click(tab);

      if (screen.queryByText("SubstanceIndex.json")) seen.add("substance-index");
      if (screen.queryByRole("link", { name: /github repository/i })) seen.add("repository");
      if (screen.queryByRole("heading", { name: /molecule art pack/i })) seen.add("molecules");
    }

    // dose.wiki owns the molecule pack, SubstanceIndex.json and the dosewiki repository.
    // Rendering them on a flavor that does not own them puts one publication's assets
    // under the other's licence statement.
    expect([...seen].sort()).toEqual(
      isEffectIndex() ? [] : ["molecules", "repository", "substance-index"],
    );
  });

  it("fills every grid row of the last tab's cards", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: docsLabel }));

    const grid = screen.getByRole("tabpanel", { name: docsLabel }).querySelector("ul");
    const columns = [...(grid?.className.matchAll(/grid-cols-(\d+)/g) ?? [])].map((match) =>
      Number(match[1]),
    );

    // The widest breakpoint decides whether the last row is short.
    expect(columns.length).toBeGreaterThan(0);
    expect(SITE_FLAVOR_CONFIG.about.docLinks.length % Math.max(...columns)).toBe(0);
  });
});
