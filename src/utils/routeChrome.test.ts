import { describe, expect, it } from "vitest";
import { getRouteChromeModel } from "./routeChrome";

describe("route chrome model", () => {
  it.each([
    ["/", "home", "dose.wiki", "none"],
    ["/substances", "substances", "Substance Index", "substances"],
    ["/lsd", "substance", "lsd - Substance Profile", "substances"],
    ["/category/psychedelics", "category", "psychedelics Category", "substances"],
    ["/mechanism/5-ht2a-agonist", "mechanism", "5 ht2a agonist Mechanism", "substances"],
    ["/chemical/tryptamine", "classification", "tryptamine Chemical Class", "substances"],
    ["/psychoactive/psychedelic", "classification", "psychedelic Psychoactive Class", "substances"],
    ["/effects", "effects", "Subjective Effects Index", "effects"],
    ["/effects/euphoria", "effect", "euphoria - Subjective Effect", "effects"],
    ["/effects/category/visual", "effect-category", "visual Effects", "effects"],
    ["/reports", "reports", "Trip Reports", "reports"],
    ["/reports/example-report", "report", "Trip Report", "reports"],
    ["/about", "about", "About dose.wiki", "about"],
    ["/contributors/alice", "contributor", "Contributor Profile", "none"],
    ["/search?q=test%20query", "search", 'Search Results for "test query"', "none"],
    ["/dev/profile", "dev", "Developer Tools - profile", "dev"],
  ])("models %s", (pathname, viewType, pageTitle, activeGroup) => {
    const model = getRouteChromeModel(pathname);

    expect(model.currentView.type).toBe(viewType);
    expect(model.pageTitle).toBe(pageTitle);
    expect(model.activeGroup).toBe(activeGroup);
  });

  it("centralizes route hrefs, logo behavior, and footer policy", () => {
    const model = getRouteChromeModel("/effects/euphoria");

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
      ["about", "/about", "About dose.wiki"],
    ]);
    expect(model.footerNavItems).toEqual([]);
    expect(model.footerExternalNavItems).toEqual([]);
    expect(model.footerShowsThemeToggle).toBe(true);
  });
});
