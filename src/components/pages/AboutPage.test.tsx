import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import {
  CONTRIBUTOR_ROSTER_SECTION_TITLE,
  CURATED_FOUNDERS_SECTION_TITLE,
  buildContributorRoster,
  selectAboutContributors,
} from "@/data/contributorRoster";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { AboutPage } from "./AboutPage";

/** Flavored: "Documentation" on dose.wiki, "Licensing & Contact" on Effect Index. */
const docsLabel = SITE_FLAVOR_CONFIG.about.docsTitle;

/**
 * The Open Data section ships dose.wiki's own exports, so it does not exist on every
 * flavor. Its assertions run only where the section is owned; the other flavor asserts
 * its absence.
 */
const showOpenData = SITE_FLAVOR_CONFIG.about.showOpenData;
const describeOpenData = showOpenData ? describe : describe.skip;

/** Section anchor ids, in page order, as this flavor renders them. */
const expectedSectionIds = [
  "mission",
  ...(showOpenData ? ["data"] : []),
  "contributors",
  "docs",
];

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

function renderAboutPage(
  overrides: Partial<React.ComponentProps<typeof AboutPage>> = {},
) {
  return render(
    <AboutPage
      founderProfiles={founderProfiles}
      previewSnapshots={[]}
      missionContent={<p>Mission test copy for harm reduction.</p>}
      moleculeCount={572}
      {...overrides}
    />,
  );
}

/** The named page section, for scoping queries the way the old tab panels did. */
function sectionById(id: string): HTMLElement {
  const section = document.getElementById(id);
  if (!(section instanceof HTMLElement)) {
    throw new Error(`Expected a #${id} section`);
  }
  return section;
}

beforeEach(() => {
  window.history.pushState(null, "", "/about");
});

describe("AboutPage sections", () => {
  it("renders every section on one page, without tabs", () => {
    renderAboutPage();

    expect(screen.getByText("Mission test copy for harm reduction.")).toBeInTheDocument();
    expect(Boolean(screen.queryByRole("heading", { name: /open data & tools/i }))).toBe(
      showOpenData,
    );
    expect(
      screen.getByRole("heading", { name: /founders & contributors/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: docsLabel })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("renders the shared table of contents with one anchor per rendered section", () => {
    renderAboutPage();

    // Both shared TOC surfaces render: the gutter rail and the mobile chip strip.
    // Each lists exactly the rendered sections, so every id resolves to a section
    // element and appears in both surfaces.
    for (const id of expectedSectionIds) {
      expect(sectionById(id).tagName).toBe("SECTION");
      expect(document.querySelectorAll(`a[href="#${id}"]`)).toHaveLength(2);
    }

    // A flavor without the Open Data section must not advertise its anchor either.
    if (!showOpenData) {
      expect(document.querySelector('a[href="#data"]')).toBeNull();
      expect(document.getElementById("data")).toBeNull();
    }
  });

  it("shows founder cards in the contributors section", () => {
    renderAboutPage();

    const panel = sectionById("contributors");
    expect(
      within(panel).getByRole("link", { name: /josie founder/i }),
    ).toHaveAttribute("href", "/contributors/josie");
    expect(
      within(panel).getByRole("link", { name: /alex contributor/i }),
    ).toHaveAttribute("href", "/contributors/alex");
  });

  it("shows this flavor's documentation links", () => {
    renderAboutPage();

    const panel = sectionById("docs");

    // The cards are flavored: dose.wiki advertises its `/docs/*` pages, Effect Index its
    // own copyright disclaimer and supporting pages. Asserting the fixed dose.wiki set
    // here would ship a false licensing claim on the other build without failing.
    for (const doc of SITE_FLAVOR_CONFIG.about.docLinks) {
      expect(
        within(panel).getByRole("link", { name: new RegExp(doc.title, "i") }),
      ).toHaveAttribute("href", doc.href);
    }
  });

  it("states this flavor's reuse terms, not the other flavor's", () => {
    renderAboutPage();

    // The notice sits in the Open Data section where that section exists, and with the
    // licence card where it does not.
    const panel = sectionById(showOpenData ? "data" : "docs");

    // dose.wiki dedicates its material to the public domain (CC0); Effect Index licenses
    // it under CC BY-NC-SA. Shipping either claim on the other build would be false.
    const { linkHref, linkLabel } = SITE_FLAVOR_CONFIG.about.reuseNotice;
    expect(linkLabel).toBe(isEffectIndex() ? "CC BY-NC-SA 4.0" : "CC0");
    expect(within(panel).getByRole("link", { name: linkLabel })).toHaveAttribute(
      "href",
      linkHref,
    );
  });
});

/**
 * Effect Index's contributor section lists the whole roster instead of a curated founder
 * subset. The section is prop-driven rather than flavor-driven, so both publications'
 * renderings are exercised in one run: supplying a roster is the Effect Index shape,
 * omitting it is dose.wiki's.
 */
describe("AboutPage contributor roster", () => {
  function contributorProfile(
    key: string,
    displayName: string,
    overrides: Partial<NormalizedUserProfile> = {},
  ): NormalizedUserProfile {
    return {
      key,
      displayName,
      aliases: [],
      avatarUrl: null,
      bio: "",
      links: [],
      hasCustomBio: false,
      ...overrides,
    };
  }

  const josie = contributorProfile("JOSIE", "Josie Kins", {
    aliases: ["josie", "josikinz"],
    role: "Founder",
    avatarUrl: "/profile-avatars/josie.png",
    bio: "Founded the project.",
    hasCustomBio: true,
  });
  const kaytwo = contributorProfile("KAYTWO", "Kaytwo", { aliases: ["kaylee"] });
  const nervewing = contributorProfile("NERVEWING", "Nervewing", { aliases: ["nervewing"] });
  const stingrayz = contributorProfile("STINGRAYZ", "StingrayZ", { aliases: ["stingrayz"] });
  const rho = contributorProfile("RHO", "Rho");
  const lyrea = contributorProfile("LYREA", "Lyrea", { aliases: ["witchy"] });

  const allProfiles = [josie, kaytwo, lyrea, nervewing, rho, stingrayz];
  // Josie is deliberately *not* the most-referenced profile, so her position can only come
  // from the pin.
  const referenceCounts = new Map<string, number>([
    ["JOSIE", 3],
    ["KAYTWO", 192],
    ["NERVEWING", 76],
    ["STINGRAYZ", 12],
    ["LYREA", 40],
    ["RHO", 0],
  ]);

  const effectIndexSelection = selectAboutContributors({
    isEffectIndex: true,
    allProfiles,
    curatedFounderProfiles: [lyrea, josie],
    referenceCounts,
  });

  function renderRosterSection(
    overrides: Partial<React.ComponentProps<typeof AboutPage>> = {},
  ) {
    renderAboutPage({
      founderProfiles: effectIndexSelection.founderProfiles,
      contributorRoster: effectIndexSelection.roster,
      contributorsSectionTitle: effectIndexSelection.sectionTitle,
      ...overrides,
    });

    return sectionById("contributors");
  }

  it("lists every contributor, not a curated subset", () => {
    const panel = renderRosterSection();

    for (const displayName of ["Josie Kins", "Kaytwo", "Nervewing", "StingrayZ", "Rho"]) {
      expect(within(panel).getByRole("link", { name: new RegExp(displayName, "i") })).toHaveAttribute(
        "href",
        `/contributors/${displayName === "Josie Kins" ? "josie" : displayName.toLowerCase()}`,
      );
    }

    expect(within(panel).getAllByRole("link")).toHaveLength(allProfiles.length - 1);
  });

  it("excludes Lyrea, who did not contribute to this publication", () => {
    const panel = renderRosterSection();

    expect(within(panel).queryByRole("link", { name: /lyrea/i })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/witchy/i)).not.toBeInTheDocument();
  });

  it("puts the founder in her own labelled region ahead of the ranked grid", () => {
    const panel = renderRosterSection();

    // Structural, not a sort result: the founder card sits outside the contributor grid.
    const grid = within(panel).getByRole("list");
    const founderLink = within(panel).getByRole("link", { name: /josie kins/i });

    expect(grid.contains(founderLink)).toBe(false);
    expect(within(panel).getByText("Founder")).toBeInTheDocument();
    expect(within(panel).getAllByRole("link")[0]).toBe(founderLink);
    expect(founderLink).toHaveTextContent("Founder · 3 pages");
  });

  it("orders the remaining contributors by page references, descending, zeroes last", () => {
    const panel = renderRosterSection();

    const ranked = within(within(panel).getByRole("list"))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(ranked).toEqual([
      "/contributors/kaytwo",
      "/contributors/nervewing",
      "/contributors/stingrayz",
      "/contributors/rho",
    ]);
  });

  it("renders a contributor with no avatar, bio, role or references cleanly", () => {
    const panel = renderRosterSection();

    const bare = within(panel).getByRole("link", { name: /rho/i });

    // Nothing to credit, so the card falls back to its handle rather than showing "0 pages".
    expect(bare).toHaveTextContent("@rho");
    expect(bare).not.toHaveTextContent(/pages/i);
    expect(bare.querySelector("img")).toBeNull();
  });

  it("names the section heading for the whole roster", () => {
    const panel = renderRosterSection();

    expect(
      within(panel).getByRole("heading", { name: CONTRIBUTOR_ROSTER_SECTION_TITLE }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: CURATED_FOUNDERS_SECTION_TITLE }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the empty state when the roster has nobody in it", () => {
    const panel = renderRosterSection({
      founderProfiles: [],
      contributorRoster: buildContributorRoster({
        profiles: [],
        referenceCounts: new Map(),
      }),
    });

    expect(within(panel).getByText(/Contributor profiles are on their way/i)).toBeInTheDocument();
  });

  it("keeps dose.wiki's curated founder list, order and markup when no roster is supplied", () => {
    renderAboutPage({ founderProfiles: [lyrea, josie] });

    const panel = sectionById("contributors");

    // The curated order, not the reference ranking, and Lyrea is present.
    expect(
      within(panel)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/contributors/lyrea", "/contributors/josie"]);
    // The exact grid the curated list has always used — no roster layout leaks in.
    expect(within(panel).getByRole("list").className).toBe("grid gap-4 sm:grid-cols-2");
    expect(within(panel).queryByText(/ordered by the number of pages/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText("Founder")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/pages$/)).not.toBeInTheDocument();
  });
});

describeOpenData("AboutPage public export contract", () => {
  it("shows open data and download tooling in the flow of the page", () => {
    renderAboutPage();

    expect(
      screen.getByRole("heading", { name: /open data & tools/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("SubstanceIndex.json")).toBeInTheDocument();
    expect(screen.getByText("EffectIndex.json")).toBeInTheDocument();
    expect(screen.getByText("TripReports.json")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /github repository/i }),
    ).toHaveAttribute("href", "https://github.com/josikinzz/dosewiki");
    expect(
      screen.getByRole("heading", { name: /molecule art pack/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("molecules.json")).toBeInTheDocument();
  });

  it("keeps archival snapshot actions without the removed explanatory heading", () => {
    renderAboutPage();

    expect(screen.queryByText("Download archival snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/Convex is the live runtime source/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/refreshed nightly from the live database/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Static JSON snapshot")).not.toBeInTheDocument();
    expect(screen.getByText("GitHub Repository")).toBeInTheDocument();
    expect(screen.queryByText("Full database export")).not.toBeInTheDocument();
  });
});

describe("AboutPage cross-publication content", () => {
  it("never ships another publication's exports or repository", () => {
    renderAboutPage();

    const seen = new Set<string>();
    if (screen.queryByText("SubstanceIndex.json")) seen.add("substance-index");
    if (screen.queryByRole("link", { name: /github repository/i })) seen.add("repository");
    if (screen.queryByRole("heading", { name: /molecule art pack/i })) seen.add("molecules");

    // dose.wiki owns the molecule pack, SubstanceIndex.json and the dosewiki repository.
    // Rendering them on a flavor that does not own them puts one publication's assets
    // under the other's licence statement.
    expect([...seen].sort()).toEqual(
      isEffectIndex() ? [] : ["molecules", "repository", "substance-index"],
    );
  });

  it("fills every grid row of the documentation cards", () => {
    renderAboutPage();

    const grid = sectionById("docs").querySelector("ul");
    const columns = [...(grid?.className.matchAll(/grid-cols-(\d+)/g) ?? [])].map((match) =>
      Number(match[1]),
    );

    // The widest breakpoint decides whether the last row is short.
    expect(columns.length).toBeGreaterThan(0);
    expect(SITE_FLAVOR_CONFIG.about.docLinks.length % Math.max(...columns)).toBe(0);
  });
});
