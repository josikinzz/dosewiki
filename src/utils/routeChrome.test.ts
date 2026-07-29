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
    expect(model.footerLogo).toEqual({ href: "/" });
    expect(model.primaryNavItems.map((item) => [item.id, item.href, item.active])).toEqual([
      ["substances", "/substances", false],
      ["effects", "/effects", true],
      ["reports", "/reports", false],
    ]);
    expect(model.secondaryNavItems.map((item) => [item.id, item.href, item.mobileLabel])).toEqual([
      ["about", "/about", "About"],
    ]);
    expect(model.footerNavItems).toEqual([]);
    expect(model.footerExternalNavItems).toEqual([]);
    expect(model.footerShowsThemeToggle).toBe(true);
  });

  it("uses the canonical header icons for primary home navigation", () => {
    const model = getRouteChromeModel("/", null, DOSEWIKI);

    expect([...model.primaryNavItems, ...model.secondaryNavItems].map((item) => [item.id, resolveRouteChromeIcon(item.icon)])).toEqual([
      ["substances", "streamline-ultimate:science-molecule-strucutre-bold"],
      ["effects", "material-symbols:person-play-outline-rounded"],
      ["reports", "hugeicons:content-writing"],
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

  it("orders Effect Index navigation from its config and drops the theme toggle", () => {
    const model = getRouteChromeModel("/replications/audio", null, EFFECT_INDEX);

    expect(model.pageTitle).toBe("Replications");
    expect(model.primaryNavItems.map((item) => [item.id, item.href, item.active])).toEqual([
      ["effects", "/effects", false],
      ["replications", "/replications", true],
      ["reports", "/reports", false],
      ["substances", "/substances", false],
    ]);
    expect(model.secondaryNavItems.map((item) => [item.id, item.href, item.mobileLabel])).toEqual([
      ["about", "/about", "About"],
    ]);
    expect(model.footerShowsThemeToggle).toBe(false);
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
      ["replications", "lucide:images"],
      ["reports", "hugeicons:content-writing"],
      ["substances", "streamline-ultimate:science-molecule-strucutre-bold"],
      ["about", "lucide:info"],
    ]);
  });
});
