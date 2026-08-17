import { describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { getRouteChromeModel, getRouteChromePageTitle } from "./routeChrome";
import { resolveRouteChromeIcon } from "./routeChromeIcons";

const DOSEWIKI = SITE_FLAVOR_CONFIGS.dosewiki;
const EFFECT_INDEX = SITE_FLAVOR_CONFIGS.effectindex;

describe("route chrome model", () => {
  it.each([
    ["/", "home", "dose.wiki", "none"],
    ["/substances", "substances", "Substance Index", "substances"],
    ["/mantras", "mantras", "Mantra Vision Mandala", "none"],
    ["/lsd", "substance", "lsd - Substance Profile", "substances"],
    ["/category/psychedelics", "category", "psychedelics Category", "substances"],
    ["/mechanism/5-ht2a-agonist", "mechanism", "5 ht2a agonist Mechanism", "substances"],
    ["/chemical/tryptamine", "classification", "tryptamine Chemical Class", "substances"],
    ["/psychoactive/psychedelic", "classification", "psychedelic Psychoactive Class", "substances"],
    ["/effects", "effects", "Subjective Effects Index", "effects"],
    ["/effects/euphoria", "effect", "euphoria - Subjective Effect", "effects"],
    ["/effects/category/visual", "effect-category", "visual Effects", "effects"],
    ["/replications", "replications", "Replications", "replications"],
    // Regression: these two pages used to fall through parsePath's default arm and be
    // modelled as the substance "replications", highlighting Substances in the header.
    ["/replications/audio", "replications", "Replications", "replications"],
    ["/replications/tutorials", "replications", "Replications", "replications"],
    ["/reports", "reports", "Trip Reports", "reports"],
    ["/reports/example-report", "report", "Trip Report", "reports"],
    ["/about", "about", "About dose.wiki", "about"],
    ["/contributors/alice", "contributor", "Contributor Profile", "none"],
    ["/search?q=test%20query", "search", 'Search Results for "test query"', "none"],
    ["/dev/profile", "dev", "Developer Tools - profile", "dev"],
  ])("models %s", (pathname, viewType, pageTitle, activeGroup) => {
    // The dose.wiki config is named rather than inherited from the ambient build flavor:
    // these expectations are that publication's titles and nav groups.
    const model = getRouteChromeModel(pathname, null, DOSEWIKI);

    expect(model.currentView.type).toBe(viewType);
    expect(model.pageTitle).toBe(pageTitle);
    expect(model.activeGroup).toBe(activeGroup);
  });

  it("centralizes route hrefs, logo behavior, and footer policy", () => {
    const model = getRouteChromeModel("/effects/euphoria", null, DOSEWIKI);

    expect(model.headerLogo).toEqual({
      href: "/",
      view: { type: "home" },
    });
    expect(model.primaryNavItems.map((item) => [item.id, item.href, item.active])).toEqual([
      ["substances", "/substances", false],
      ["effects", "/effects", true],
      ["reports", "/reports", false],
      ["replications", "/replications", false],
    ]);
    expect(model.secondaryNavItems.map((item) => [item.id, item.href, item.mobileLabel])).toEqual([
      ["about", "/about", "About"],
    ]);
    expect(model.footerNavItems).toEqual([]);
    expect(model.footerExternalNavItems).toEqual([]);
  });

  it("uses the canonical header icons for primary home navigation", () => {
    const model = getRouteChromeModel("/", null, DOSEWIKI);

    expect([...model.primaryNavItems, ...model.secondaryNavItems].map((item) => [item.id, resolveRouteChromeIcon(item.icon)])).toEqual([
      ["substances", "streamline-ultimate:science-molecule-strucutre-bold"],
      ["effects", "material-symbols:person-play-outline-rounded"],
      ["reports", "hugeicons:content-writing"],
      ["replications", "hugeicons:camera-ai"],
      ["about", "lucide:info"],
    ]);
  });

  it("takes the home and About page titles from the flavor config", () => {
    expect(getRouteChromePageTitle({ type: "home" }, EFFECT_INDEX)).toBe("Effect Index");
    expect(getRouteChromePageTitle({ type: "about" }, EFFECT_INDEX)).toBe("About Effect Index");
    // The unreachable fallback arm is flavored too, so a view this switch does not know
    // never leaks the other publication's name.
    expect(getRouteChromePageTitle({ type: "unknown" } as never, EFFECT_INDEX)).toBe("Effect Index");
  });

  it("names the replications section the same way under either flavor", () => {
    expect(getRouteChromePageTitle({ type: "replications" }, DOSEWIKI)).toBe("Replications");
    expect(getRouteChromePageTitle({ type: "replications" }, EFFECT_INDEX)).toBe("Replications");
  });

  it("orders Effect Index navigation from its config", () => {
    const model = getRouteChromeModel("/replications/audio", null, EFFECT_INDEX);

    expect(model.pageTitle).toBe("Replications");
    expect(model.primaryNavItems.map((item) => [item.id, item.href, item.active])).toEqual([
      ["effects", "/effects", false],
      ["replications", "/replications", true],
      ["reports", "/reports", false],
    ]);
    expect(model.secondaryNavItems.map((item) => [item.id, item.href, item.mobileLabel])).toEqual([
      ["about", "/about", "Project"],
    ]);
  });

  it("uses the canonical header icons for Effect Index navigation", () => {
    const model = getRouteChromeModel("/", null, EFFECT_INDEX);

    expect(
      [...model.primaryNavItems, ...model.secondaryNavItems].map((item) => [
        item.id,
        resolveRouteChromeIcon(item.icon),
      ]),
    ).toEqual([
      ["effects", "material-symbols:person-play-outline-rounded"],
      ["replications", "hugeicons:camera-ai"],
      ["reports", "hugeicons:content-writing"],
      ["about", "lucide:info"],
    ]);
  });

  it("builds the original Effect Index dropdown tree, labels and all", () => {
    const model = getRouteChromeModel("/", null, EFFECT_INDEX);
    const tree = [...model.primaryNavItems, ...model.secondaryNavItems].map((item) => [
      item.label,
      item.href,
      (item.submenu ?? []).map((child) => [child.label, child.href, child.external]),
    ]);

    expect(tree).toEqual([
      [
        "Effects",
        "/effects",
        [
          ["Index", "/effects", false],
          ["Sensory", "/effects#sensory", false],
          ["Cognitive", "/effects#cognitive", false],
          ["Physical", "/effects#physical", false],
        ],
      ],
      [
        "Replications",
        "/replications",
        [
          ["Gallery", "/replications", false],
          ["Audio", "/replications/audio", false],
          ["Subreddit", "https://reddit.com/r/replications", true],
          ["Tutorials", "/replications/tutorials", false],
        ],
      ],
      // The flavor renames this section, and the rename reaches the mobile label too. Its one
      // declared child leads back to /reports, so the model offers no submenu — see below.
      ["Trip Reports", "/reports", []],
      [
        "Project",
        "/about",
        [
          ["About", "/about", false],
          ["Articles", "/articles", false],
          ["Blog", "/blog", false],
          ["Search", "/search", false],
          ["Github", "https://github.com/josikinzz/EffectIndex2.0", true],
        ],
      ],
    ]);
    // Children carry stable, readable keys derived from their labels.
    expect(model.secondaryNavItems[0]?.submenu?.map((child) => child.id)).toEqual([
      "about-about",
      "about-articles",
      "about-blog",
      "about-search",
      "about-github",
    ]);
  });

  it("drops a submenu whose only child leads where its parent already goes", () => {
    const reports = getRouteChromeModel("/", null, EFFECT_INDEX).primaryNavItems.find(
      (item) => item.id === "reports",
    );

    // The flavor still declares the self-referential child the original site's data had.
    expect(EFFECT_INDEX.navMenus.reports?.children).toEqual([
      { label: "Trip Reports", href: "/reports" },
    ]);
    // A disclosure control revealing one link back to the label's own destination controls
    // nothing, so the model does not offer one.
    expect(reports?.href).toBe("/reports");
    expect(reports?.submenu).toBeUndefined();

    // A single child that leads somewhere else is a real submenu and survives.
    const elsewhere = getRouteChromeModel("/", null, {
      ...EFFECT_INDEX,
      navMenus: { reports: { children: [{ label: "Submit", href: "/reports/submit" }] } },
    }).primaryNavItems.find((item) => item.id === "reports");

    expect(elsewhere?.submenu?.map((child) => child.href)).toEqual(["/reports/submit"]);
  });

  it("never offers Substances in Effect Index navigation", () => {
    const model = getRouteChromeModel("/substances", null, EFFECT_INDEX);
    const items = [...model.primaryNavItems, ...model.secondaryNavItems];

    // The section stays live and still resolves — it is simply not advertised in the chrome.
    expect(model.pageTitle).toBe("Substance Index");
    expect(model.activeGroup).toBe("substances");
    expect(items.map((item) => item.id)).not.toContain("substances");
    expect(
      items.flatMap((item) => (item.submenu ?? []).map((child) => child.href)),
    ).not.toContain("/substances");
  });

  it("leaves dose.wiki's items free of submenus so the header renders plain links", () => {
    for (const pathname of ["/", "/substances", "/effects", "/about"]) {
      const model = getRouteChromeModel(pathname, null, DOSEWIKI);

      for (const item of [...model.primaryNavItems, ...model.secondaryNavItems]) {
        expect(item.submenu).toBeUndefined();
      }
    }
  });

  it("routes home through the logo rather than a nav item, on either flavor", () => {
    for (const config of [DOSEWIKI, EFFECT_INDEX]) {
      for (const pathname of ["/", "/effects", "/search?q=test", "/contributors/alice"]) {
        const model = getRouteChromeModel(pathname, null, config);

        // No publication lists a Home item: the header logo is the route home, and it is on
        // every page. A nav entry would have spent a slot on the one destination the chrome
        // cannot lose — and, being in no section, would have needed an active rule of its own.
        expect(model.headerLogo).toEqual({ href: "/", view: { type: "home" } });
        expect(
          [...model.primaryNavItems, ...model.secondaryNavItems].map((item) => item.id),
        ).not.toContain("home");
      }
    }
  });

  it("marks a nav item active only for the section it belongs to", () => {
    // Every item now belongs to a section, so plain group matching is the whole rule: pages in
    // no section (search, contributor profiles, the mandala) light nothing.
    const activeIds = (pathname: string) =>
      [
        ...getRouteChromeModel(pathname, null, EFFECT_INDEX).primaryNavItems,
        ...getRouteChromeModel(pathname, null, EFFECT_INDEX).secondaryNavItems,
      ]
        .filter((item) => item.active)
        .map((item) => item.id);

    expect(activeIds("/effects")).toEqual(["effects"]);
    expect(activeIds("/replications/audio")).toEqual(["replications"]);
    expect(activeIds("/about")).toEqual(["about"]);
    expect(activeIds("/")).toEqual([]);
    expect(activeIds("/search?q=test")).toEqual([]);
    expect(activeIds("/contributors/alice")).toEqual([]);
    expect(activeIds("/mantras")).toEqual([]);
  });
});
