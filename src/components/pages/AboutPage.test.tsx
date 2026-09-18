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
import { ABOUT_COMMUNITY_LINKS } from "@/data/content/aboutCommunity";
import { AppearanceTestProvider } from "@/test/AppearanceTestProvider";
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
  ...(!isEffectIndex() ? ["sources", "contributors"] : []),
  "docs",
  ...(showOpenData ? ["data"] : []),
  ...(isEffectIndex() ? ["contributors"] : []),
  ...(SITE_FLAVOR_CONFIG.about.showCommunity ? ["community"] : []),
  ...(SITE_FLAVOR_CONFIG.about.contact ? ["contact"] : []),
];

const founderProfiles: NormalizedUserProfile[] = [
  {
    key: "JOSIE",
    displayName: "Josie Founder",
    aliases: [],
    avatarUrl: null,
    bio: "",
    role: "Research editor",
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
    <AppearanceTestProvider>
      <AboutPage
        founderProfiles={founderProfiles}
        previewSnapshots={[]}
        missionContent={<p>Mission test copy for harm reduction.</p>}
        sourcesContent={<p>Sources section fixture.</p>}
        historyContent={<p>Project history fixture.</p>}
        downloads={{
          substances: { count: 1234, bytes: 23_895_032 },
          effects: { count: 310, bytes: 1_525_750 },
          reports: { count: 89, bytes: 1_246_046 },
          molecules: { count: 572, bytes: 523_546 },
        }}
        {...overrides}
      />
    </AppearanceTestProvider>,
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
    expect(Boolean(screen.queryByRole("heading", { name: "Downloads & reuse" }))).toBe(
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
    expect(
      [...document.querySelectorAll("main section[id]")].map((section) => section.id),
    ).toEqual(expectedSectionIds);
    for (const id of expectedSectionIds) {
      expect(sectionById(id).tagName).toBe("SECTION");
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      expect(document.querySelectorAll(`a[href="#${id}"]`)).toHaveLength(2);
    }

    // A flavor without the Open Data section must not advertise its anchor either.
    if (!showOpenData) {
      expect(document.querySelector('a[href="#data"]')).toBeNull();
      expect(document.getElementById("data")).toBeNull();
    }
  });

  it("keeps legacy anchors while matching navigation labels to section headings", () => {
    renderAboutPage();

    const labels = [
      { id: "mission", label: isEffectIndex() ? "Mission" : "Introduction" },
      ...(showOpenData ? [{ id: "data", label: "Downloads & reuse" }] : []),
      ...(!isEffectIndex() ? [{ id: "sources", label: "Sources and review" }] : []),
    ];
    for (const { id, label } of labels) {
      expect(within(sectionById(id)).getByRole("heading", { name: label })).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
      for (const link of screen.getAllByRole("link", { name: label })) {
        expect(link).toHaveAttribute("href", `#${id}`);
      }
    }
  });

  it("omits the sources section and anchor when no content is supplied", () => {
    renderAboutPage({ sourcesContent: undefined, historyContent: undefined });

    expect(document.getElementById("sources")).toBeNull();
    expect(document.querySelector('a[href="#sources"]')).toBeNull();
    expect(screen.queryByRole("heading", { name: "Project history" })).not.toBeInTheDocument();
    expect(within(sectionById("contributors")).getByRole("link", { name: /josie founder/i }))
      .toBeInTheDocument();
  });

  it("projects sources and history only on dose.wiki, with history before founder cards", () => {
    renderAboutPage();

    if (isEffectIndex()) {
      expect(screen.queryByText("Sources section fixture.")).not.toBeInTheDocument();
      expect(screen.queryByText("Project history fixture.")).not.toBeInTheDocument();
      expect(document.getElementById("sources")).toBeNull();
      expect(document.querySelector('a[href="#sources"]')).toBeNull();
      expect(screen.queryByRole("heading", { name: "Introduction" })).not.toBeInTheDocument();
      return;
    }

    expect(within(sectionById("sources")).getByText("Sources section fixture."))
      .toBeInTheDocument();
    const contributors = sectionById("contributors");
    const history = within(contributors).getByText("Project history fixture.");
    const founder = within(contributors).getByRole("link", { name: /josie founder/i });
    expect(history.compareDocumentPosition(founder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps contact actions local to the publication that owns the inbox", () => {
    renderAboutPage();

    const contact = SITE_FLAVOR_CONFIG.about.contact;
    if (!contact) {
      expect(document.getElementById("contact")).toBeNull();
      expect(document.querySelector('a[href="#contact"]')).toBeNull();
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      return;
    }

    const section = sectionById("contact");
    expect(within(section).getByRole("link", { name: contact.email }))
      .toHaveAttribute("href", `mailto:${contact.email}`);
    expect(within(section).getByRole("link", { name: "Open the feedback form" }))
      .toHaveAttribute("href", contact.feedbackHref);
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
    const founder = within(panel).getByRole("link", { name: /josie founder/i });
    expect(founder).toHaveTextContent("Research editor");
    expect(founder).not.toHaveTextContent("@josie");
    expect(within(panel).getByRole("link", { name: /alex contributor/i }))
      .toHaveTextContent("@alex");
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
  // Stored role from dose.wiki, which she founded; Effect Index re-badges it in display.
  const lyrea = contributorProfile("LYREA", "Lyrea", { aliases: ["oldhandle"], role: "Founder" });

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

    for (const displayName of ["Josie Kins", "Kaytwo", "Lyrea", "Nervewing", "StingrayZ", "Rho"]) {
      expect(within(panel).getByRole("link", { name: new RegExp(displayName, "i") })).toHaveAttribute(
        "href",
        `/contributors/${displayName === "Josie Kins" ? "josie" : displayName.toLowerCase()}`,
      );
    }

    // Contributor profile links only; the section also carries the flavor's
    // supporter credit, which is not a roster entry.
    const profileLinks = within(panel)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/contributors/"));
    expect(profileLinks).toHaveLength(allProfiles.length);
  });

  it("lists Lyrea, whose expert reviews count as contributions, without her internal alias", () => {
    const panel = renderRosterSection();

    expect(within(panel).getByRole("link", { name: /lyrea/i })).toHaveAttribute(
      "href",
      "/contributors/lyrea",
    );
    // Aliases stay internal even now that the profile is listed.
    expect(within(panel).queryByText(/oldhandle/i)).not.toBeInTheDocument();
  });

  it("puts the founder in her own labelled region ahead of the pinned and ranked grids", () => {
    const panel = renderRosterSection();

    // Structural, not a sort result: the founder card sits outside every grid.
    const grids = within(panel).getAllByRole("list");
    const founderLink = within(panel).getByRole("link", { name: /josie kins/i });

    expect(grids.some((grid) => grid.contains(founderLink))).toBe(false);
    expect(within(panel).getByText("Founder")).toBeInTheDocument();
    expect(within(panel).getAllByRole("link")[0]).toBe(founderLink);
    expect(founderLink).toHaveTextContent("Founder · 3 pages");
  });

  it("puts Lyrea in a Staff region between the founder and the ranked grid, badged Administrator", () => {
    const panel = renderRosterSection();

    const [staffGrid, rankedGrid] = within(panel).getAllByRole("list");
    const lyreaLink = within(panel).getByRole("link", { name: /lyrea/i });

    // Staff sits in its own labelled grid above the contributors...
    expect(within(panel).getByText("Staff")).toBeInTheDocument();
    expect(staffGrid?.contains(lyreaLink)).toBe(true);
    // ...and not in the ranked grid, so she never appears twice.
    expect(rankedGrid?.contains(lyreaLink)).toBe(false);
    // Region order: the founder card first, then staff, then everybody else.
    expect(within(panel).getAllByRole("link").indexOf(lyreaLink)).toBe(1);
    // Flavor-scoped title: her stored role says Founder, this publication prints
    // Administrator, in the same `role · count` credit-line shape as every card.
    expect(lyreaLink).toHaveTextContent("Administrator · 40 pages");
    expect(lyreaLink).not.toHaveTextContent("Founder");
  });

  it("orders the remaining contributors by page references, descending, zeroes last", () => {
    const panel = renderRosterSection();

    // The ranked grid is the last list; the staff grid sits above it.
    const grids = within(panel).getAllByRole("list");
    const ranked = within(grids[grids.length - 1]!)
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

  it("keeps curated founder order and stored roles without roster-specific credits", () => {
    renderAboutPage({ founderProfiles: [lyrea, josie] });

    const panel = sectionById("contributors");

    // The curated order, not the reference ranking, and Lyrea is present. The
    // trailing link is the flavor's supporter credit (absent where the flavor
    // declares none), not a roster entry.
    const supporterHref = SITE_FLAVOR_CONFIG.footer.supporter?.href;
    expect(
      within(panel)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/contributors/lyrea",
      "/contributors/josie",
      ...(supporterHref ? [supporterHref] : []),
    ]);
    for (const name of ["lyrea", "josie kins"]) {
      const link = within(panel).getByRole("link", { name: new RegExp(name, "i") });
      expect(link).toHaveTextContent("Founder");
      expect(link).not.toHaveTextContent("@");
    }
    expect(within(panel).queryByText("Staff")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/administrator/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/pages$/)).not.toBeInTheDocument();
  });
});

describeOpenData("AboutPage public export contract", () => {
  it("shows open data and download tooling in the flow of the page", () => {
    renderAboutPage();

    expect(
      screen.getByRole("heading", { name: "Downloads & reuse" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SubstanceIndex.json")).toBeInTheDocument();
    expect(screen.getByText("EffectIndex.json")).toBeInTheDocument();
    expect(screen.getByText("TripReports.json")).toBeInTheDocument();
    // The molecule pack sits in the same download list as the datasets.
    expect(screen.getByText("dosewiki-molecules.zip")).toBeInTheDocument();
    // Every file takes the same noun, and the caption says how big the file is.
    expect(screen.getByText("1,234 entries")).toBeInTheDocument();
    expect(screen.getByText("23.9 MB")).toBeInTheDocument();
    expect(screen.getByText("310 entries")).toBeInTheDocument();
    expect(screen.getByText("1.5 MB")).toBeInTheDocument();
    expect(screen.getByText("89 entries")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB")).toBeInTheDocument();
    expect(screen.getByText("572 entries")).toBeInTheDocument();
    expect(screen.getByText("524 KB")).toBeInTheDocument();
    // The button's accessible name carries both figures: a screen reader user
    // deciding whether to fetch 24 MB should not have to find them elsewhere.
    expect(
      screen.getByRole("button", {
        name: "Download SubstanceIndex.json, 1,234 entries, 23.9 MB",
      }),
    ).toBeInTheDocument();
    // The manifest ships inside the zip; no separate download or repository link.
    expect(
      screen.queryByRole("link", { name: /github repository/i }),
    ).not.toBeInTheDocument();
  });

});

describe("AboutPage cross-publication content", () => {
  it("never ships another publication's exports or repository", () => {
    renderAboutPage();

    const seen = new Set<string>();
    if (screen.queryByText("SubstanceIndex.json")) seen.add("substance-index");
    if (screen.queryByText("dosewiki-molecules.zip")) seen.add("molecules");

    // dose.wiki owns the molecule pack and SubstanceIndex.json. Rendering them on a
    // flavor that does not own them puts one publication's assets under the other's
    // licence statement.
    expect([...seen].sort()).toEqual(
      isEffectIndex() ? [] : ["molecules", "substance-index"],
    );
  });

});

/**
 * Partners & Community is dose.wiki's section, so its assertions run only
 * where `about.showCommunity` is set; the other flavor asserts its absence.
 * The roster is one flat compact list with no descriptive copy, gated purely
 * on the flavor config.
 */
const showCommunity = SITE_FLAVOR_CONFIG.about.showCommunity;
const describeCommunity = showCommunity ? describe : describe.skip;

describeCommunity("AboutPage community section", () => {
  it("renders the section, its TOC anchors, and every roster entry", () => {
    renderAboutPage();

    expect(
      screen.getByRole("heading", { name: "Partners & Community" }),
    ).toBeInTheDocument();
    expect(sectionById("community").tagName).toBe("SECTION");
    expect(document.querySelectorAll('a[href="#community"]')).toHaveLength(2);

    const section = sectionById("community");
    for (const entry of ABOUT_COMMUNITY_LINKS) {
      expect(within(section).getByText(entry.name)).toBeInTheDocument();
    }
  });

  it("renders one flat list without tier labels or descriptive copy", () => {
    renderAboutPage();

    const section = sectionById("community");
    expect(section.querySelectorAll("ul")).toHaveLength(1);
    for (const label of [
      "Data partners",
      "Friends & community",
      "Sister projects",
      "Lineage",
    ]) {
      expect(within(section).queryByText(label)).toBeNull();
    }
    // The retired blurbs and data tags stay gone until copy is rewritten.
    expect(within(section).queryByText("dose.wiki API")).toBeNull();
    expect(
      within(section).queryByText(/combination-safety data/i),
    ).toBeNull();
  });

  it("links every roster entry externally with a safe rel", () => {
    renderAboutPage();

    const links = sectionById("community").querySelectorAll("a[href^='https://']");
    expect(links.length).toBe(ABOUT_COMMUNITY_LINKS.length);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
});

if (!showCommunity) {
  describe("AboutPage community section (flavor without it)", () => {
    it("never renders the section or its anchor", () => {
      renderAboutPage();

      expect(document.getElementById("community")).toBeNull();
      expect(document.querySelector('a[href="#community"]')).toBeNull();
    });
  });
}
