import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_FLAVOR,
  SITE_FLAVOR,
  SITE_FLAVOR_CONFIG,
  SITE_FLAVOR_CONFIGS,
  getSiteFlavorConfig,
  isEffectIndex,
  isFlavorRouteEnabled,
  resolveSiteFlavor,
} from "./siteFlavor";

describe("site flavor config", () => {
  it("defaults to the dose.wiki flavor when the variable is unset, empty, or unrecognised", () => {
    expect(DEFAULT_SITE_FLAVOR).toBe("dosewiki");
    expect(resolveSiteFlavor({})).toBe("dosewiki");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: undefined })).toBe("dosewiki");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "" })).toBe("dosewiki");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "   " })).toBe("dosewiki");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "psychonautwiki" })).toBe("dosewiki");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "effect-index" })).toBe("dosewiki");
  });

  it("resolves the Effect Index flavor from the public environment variable", () => {
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "effectindex" })).toBe("effectindex");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "  EffectIndex " })).toBe("effectindex");
    expect(resolveSiteFlavor({ NEXT_PUBLIC_SITE_FLAVOR: "dosewiki" })).toBe("dosewiki");
  });

  it("reads the ambient environment for the module-scope config", () => {
    // Asserted against the resolver rather than a hardcoded "dosewiki" so the suite also
    // passes under an Effect Index build (`NEXT_PUBLIC_SITE_FLAVOR=effectindex vitest run`).
    expect(SITE_FLAVOR).toBe(resolveSiteFlavor());
    expect(SITE_FLAVOR_CONFIG).toBe(SITE_FLAVOR_CONFIGS[resolveSiteFlavor()]);
    expect(SITE_FLAVOR_CONFIG.flavor).toBe(SITE_FLAVOR);
    expect(getSiteFlavorConfig({ NEXT_PUBLIC_SITE_FLAVOR: "effectindex" })).toBe(
      SITE_FLAVOR_CONFIGS.effectindex,
    );
    expect(getSiteFlavorConfig({ NEXT_PUBLIC_SITE_FLAVOR: "dosewiki" })).toBe(
      SITE_FLAVOR_CONFIGS.dosewiki,
    );
  });

  it("describes the dose.wiki publication identity", () => {
    const config = SITE_FLAVOR_CONFIGS.dosewiki;

    expect(config).toMatchObject({
      flavor: "dosewiki",
      name: "dose.wiki",
      defaultSiteUrl: "https://dosewiki-admin.vercel.app",
      launchSiteUrl: "https://dose.wiki",
      description: "An open encyclopedic database for the study of psychopharmacology",
      logoPath: "/icon-512.png",
      socialCard: { path: "/icon-512.png", width: 512, height: 512 },
      homeTitle: "dose.wiki",
      aboutTitle: "About dose.wiki",
      showThemeToggle: true,
      lockedTheme: null,
    });
    expect(config.primaryNavIds).toEqual(["substances", "effects", "reports"]);
    expect(config.secondaryNavIds).toEqual(["about"]);
    expect(config.quickLinkIds).toEqual(["substances", "effects", "reports", "about"]);
    expect(config.flavorGatedRoutes).toEqual([]);
    expect(config.organization).toEqual({
      publisherName: "dose.wiki",
      contributorsName: "dose.wiki Contributors",
      subjectiveEffectIndexName: "dose.wiki Subjective Effect Index",
    });
  });

  it("describes the Effect Index publication identity", () => {
    const config = SITE_FLAVOR_CONFIGS.effectindex;

    expect(config).toMatchObject({
      flavor: "effectindex",
      name: "Effect Index",
      defaultSiteUrl: "https://effectindex.com",
      launchSiteUrl: "https://effectindex.com",
      description:
        "A resource dedicated to establishing the field of formalised subjective effect documentation.",
      logoPath: "/effectindex/icon.png",
      homeTitle: "Effect Index",
      aboutTitle: "About Effect Index",
      showThemeToggle: false,
      lockedTheme: "light",
    });
    expect(config.primaryNavIds).toEqual(["effects", "replications", "reports"]);
    expect(config.secondaryNavIds).toEqual(["about"]);
    expect(config.quickLinkIds).toEqual(["effects", "replications", "reports", "about"]);
    expect(config.organization).toEqual({
      publisherName: "Effect Index",
      contributorsName: "Effect Index Contributors",
      subjectiveEffectIndexName: "Subjective Effect Index",
    });
  });

  it("declares the original effectindex.com navigation tree", () => {
    const { navMenus } = SITE_FLAVOR_CONFIGS.effectindex;

    // Labels are verbatim from the old site's `store/navigation.json`. Hrefs match it too,
    // except the three effect groupings: that site filtered with `?type=Sensory`, while this
    // codebase's index reads its tab from the fragment.
    expect(navMenus.effects?.children).toEqual([
      { label: "Index", href: "/effects" },
      { label: "Sensory", href: "/effects#sensory" },
      { label: "Cognitive", href: "/effects#cognitive" },
      { label: "Physical", href: "/effects#physical" },
    ]);
    expect(navMenus.replications?.children).toEqual([
      { label: "Gallery", href: "/replications" },
      { label: "Audio", href: "/replications/audio" },
      { label: "Subreddit", href: "https://reddit.com/r/replications", external: true },
      { label: "Tutorials", href: "/replications/tutorials" },
    ]);
    // Deliberately a single child identical to its parent: the parent row expands rather
    // than navigating, so /reports needs a child of its own to stay reachable.
    expect(navMenus.reports).toEqual({
      label: "Trip Reports",
      children: [{ label: "Trip Reports", href: "/reports" }],
    });
    expect(navMenus.about?.label).toBe("Project");
    expect(navMenus.about?.children).toEqual([
      { label: "About", href: "/about" },
      { label: "Articles", href: "/articles" },
      { label: "Blog", href: "/blog" },
      { label: "Search", href: "/search" },
      { label: "Github", href: "https://github.com/josikinzz/EffectIndex2.0", external: true },
    ]);
    // The original led with a Home item; it is gone deliberately, because the wordmark beside
    // the nav is already a link to `/`. Nothing in the tree names it.
    expect(Object.keys(navMenus)).toEqual(["effects", "replications", "reports", "about"]);
  });

  it("keeps Substances out of the Effect Index header and homepage entirely", () => {
    const config = SITE_FLAVOR_CONFIGS.effectindex;
    const everyNavId = [...config.primaryNavIds, ...config.secondaryNavIds, ...config.quickLinkIds];

    // The original header had no Substances entry and the site owner wants it kept that way.
    // The section itself stays live — this is about what the chrome advertises.
    expect(everyNavId).not.toContain("substances");
    for (const menu of Object.values(config.navMenus)) {
      for (const child of menu?.children ?? []) {
        expect(child.href.startsWith("/substances")).toBe(false);
      }
    }
  });

  it("leaves dose.wiki's navigation flat, with no dropdowns to render", () => {
    const config = SITE_FLAVOR_CONFIGS.dosewiki;

    // The submenu path must be inert for this publication: an empty map means every item
    // renders as the plain link it always did.
    expect(config.navMenus).toEqual({});
  });

  it("keeps every quick link and nav id resolvable and every quick-linked section navigable", () => {
    for (const config of Object.values(SITE_FLAVOR_CONFIGS)) {
      const navigable = new Set([...config.primaryNavIds, ...config.secondaryNavIds]);

      // The homepage mock header splits quick links by these two lists; anything a flavor
      // quick-links but never lists would silently vanish from that header.
      for (const id of config.quickLinkIds) {
        expect(navigable.has(id)).toBe(true);
      }
      expect(new Set(config.quickLinkIds).size).toBe(config.quickLinkIds.length);

      // A dropdown declared for an id the flavor never lists would never render at all.
      for (const [id, menu] of Object.entries(config.navMenus)) {
        expect(navigable.has(id as never)).toBe(true);
        expect(menu?.label ?? menu?.children).toBeTruthy();
        for (const child of menu?.children ?? []) {
          expect(child.label.length).toBeGreaterThan(0);
          expect(child.external === true || child.href.startsWith("/")).toBe(true);
        }
      }
    }
  });

  it("gives each flavor brand chrome that names only its own publication", () => {
    const dosewiki = SITE_FLAVOR_CONFIGS.dosewiki;
    const effectindex = SITE_FLAVOR_CONFIGS.effectindex;

    // These are the literals the chrome inlined before it was flavored. They are asserted
    // verbatim because dose.wiki's rendered output must not move by a single character.
    expect(dosewiki.wordmark).toEqual({ lead: "dose", accent: ".wiki" });
    expect(dosewiki.logo).toEqual({
      markPath: null,
      alt: "dose.wiki logo",
      heroAlt: "dose.wiki molecule logo",
      heroAnimateLabel: "Animate dose.wiki logo",
    });
    expect(dosewiki.footer).toEqual({
      tagline: "Community harm-reduction information. Not medical advice.",
      licence: {
        leadIn: "Most content is public domain (CC0); see",
        linkLabel: "License & reuse",
        linkHref: "/docs/license",
        linkIsExternal: false,
        trailing: "for the details.",
      },
    });
    expect(dosewiki.loadingScreen).toEqual({
      wordmarkClassName: "text-fuchsia-300",
      statusLine: "Indexing dosage, effects, and safety references…",
      captionLine: "Preparing the public library",
    });
    expect(dosewiki.articleFallbackDescription).toBe("Browse Effect Index articles in dose.wiki.");
    // Byte-identical to the copy the page carried before it was moved into the config.
    expect(dosewiki.underConstruction).toEqual({
      description: "dose.wiki is preparing its public harm-reduction library.",
      body: "The public site is under construction while the harm-reduction library is being reviewed.",
    });

    expect(effectindex.wordmark).toEqual({ lead: "Effect ", accent: "Index" });
    expect(effectindex.logo.markPath).toBe("/effectindex/logo.svg");
    expect(effectindex.logo.alt).toBe("An eye, the Effect Index logo");

    // Effect Index is CC BY-NC-SA, not CC0: none of dose.wiki's reuse wording may leak.
    const effectIndexFooterCopy = [
      effectindex.footer.tagline,
      effectindex.footer.licence.leadIn,
      effectindex.footer.licence.linkLabel,
      effectindex.footer.licence.trailing,
      effectindex.loadingScreen.statusLine,
      effectindex.loadingScreen.captionLine,
      effectindex.articleFallbackDescription,
      effectindex.underConstruction.description,
      effectindex.underConstruction.body,
    ].join(" ");

    expect(effectIndexFooterCopy).not.toMatch(/dose\.wiki|CC0|public domain/i);
    expect(effectindex.footer.licence.linkIsExternal).toBe(true);
    expect(effectindex.footer.licence.linkHref).toBe(
      "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    );
  });

  it("answers the Effect Index predicate and route gating per flavor", () => {
    expect(isEffectIndex(SITE_FLAVOR_CONFIGS.dosewiki)).toBe(false);
    expect(isEffectIndex(SITE_FLAVOR_CONFIGS.effectindex)).toBe(true);
    // Default-argument overloads read the ambient flavor, so assert against it rather
    // than a hardcoded dose.wiki answer (keeps the suite green under an EI build).
    expect(isEffectIndex()).toBe(resolveSiteFlavor() === "effectindex");

    expect(isFlavorRouteEnabled("blog", SITE_FLAVOR_CONFIGS.dosewiki)).toBe(false);
    expect(isFlavorRouteEnabled("blog", SITE_FLAVOR_CONFIGS.effectindex)).toBe(true);
    expect(isFlavorRouteEnabled("donate", SITE_FLAVOR_CONFIGS.effectindex)).toBe(true);
    expect(isFlavorRouteEnabled("donate")).toBe(resolveSiteFlavor() === "effectindex");
  });

  it("raises Next's not-found from the Effect Index route guard on the wrong flavor", async () => {
    const { requireEffectIndexFlavor } = await import("./siteFlavor");

    expect(() => requireEffectIndexFlavor(SITE_FLAVOR_CONFIGS.effectindex)).not.toThrow();
    expect(() => requireEffectIndexFlavor(SITE_FLAVOR_CONFIGS.dosewiki)).toThrow();
    if (resolveSiteFlavor() === "effectindex") {
      expect(() => requireEffectIndexFlavor()).not.toThrow();
    } else {
      expect(() => requireEffectIndexFlavor()).toThrow();
    }
  });
});
