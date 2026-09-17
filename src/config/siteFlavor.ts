/**
 * Site Flavor — the build-time publication identity this application is compiled against.
 *
 * One codebase serves two publications: dose.wiki (the default) and Effect Index. The
 * flavor is chosen at build time via `NEXT_PUBLIC_SITE_FLAVOR` because public pages are
 * prerendered; a per-request (hostname) decision would bake the wrong identity into the
 * static output of one of the two deployments.
 *
 * This module owns *everything* that differs between the two publications. It is
 * client-safe on purpose (no `server-only` import) so client components can read it, and
 * it deliberately does NOT share a name with `server/siteConfig.ts`, which is the About
 * page's CMS document and unrelated to branding.
 */
import { notFound } from "next/navigation";
// Type-only, so it is erased at compile time: `@/theme` imports this module's ambient config
// as a value, and a value import in this direction would close that into a runtime cycle.
import type { AppearancePolicy } from "@/theme";
import { effectIndexViewPath } from "@/utils/indexViewRoutes";
import { msg } from "@/i18n/messages";
import effectIndexMissionMarkdown from "@content/about/effect-index-mission.md?raw";

export const SITE_FLAVORS = ["dosewiki", "effectindex"] as const;

export type SiteFlavor = (typeof SITE_FLAVORS)[number];

export const DEFAULT_SITE_FLAVOR: SiteFlavor = "dosewiki";

/** Environment-shaped input for the flavor resolver. Narrow on purpose. */
export type SiteFlavorEnv = {
  NEXT_PUBLIC_SITE_FLAVOR?: string;
};

/**
 * Navigation ids a flavor may order. Kept independent of `RouteChromeNavGroup` so this
 * module can name sections (`replications`) that the chrome does not model yet.
 */
export type SiteNavId = "substances" | "effects" | "replications" | "reports" | "about";

/**
 * One entry in a top-level nav item's dropdown.
 *
 * Addressed by raw `href` rather than by nav id, because submenu destinations are not
 * sections: they are routed index views, sub-pages, and other sites. Anything the
 * nav-item registry already models belongs in the id lists instead.
 */
export type SiteNavChild = {
  readonly label: string;
  /** Root-relative path — may carry a query string or fragment — or an absolute URL when `external`. */
  readonly href: string;
  /** `true` renders an anchor that opens in a new tab. */
  readonly external?: boolean;
};

/**
 * A flavor's customisation of one registry nav item: what to call it here, and what hangs
 * underneath it. Both fields are optional so a flavor can rename without adding a dropdown
 * (or the reverse).
 */
export type SiteNavMenu = {
  /**
   * Overrides the registry label for this flavor only. Effect Index calls the `reports`
   * section "Trip Reports" and files `about` under the umbrella "Project"; dose.wiki's own
   * labels must not move, so the rename lives here rather than in the registry.
   */
  readonly label?: string;
  /** Dropdown children, in display order. Omit (or leave empty) for a plain link. */
  readonly children?: readonly SiteNavChild[];
};

/**
 * Routes that only exist on some flavors. Guarded with {@link requireEffectIndexFlavor}
 * in-page and by `isFlavorGatedRequestPath` in middleware.
 *
 * `dev` is the editor shell (`/dev` and everything under it: the tool tabs, `/dev/kit`,
 * `/dev/themes`). Decision: the Effect Index deployment is credential-free and read-only
 * (AGENTS.md), so the entire prefix is a 404 there rather than a sign-in redirect for a
 * sign-in that cannot succeed. Only dose.wiki lists it.
 */
export type FlavorGatedRoute = "blog" | "donate" | "contact" | "discord" | "copyrightDisclaimer" | "dev";

export type SiteSocialCard = {
  readonly path: string;
  readonly width: number;
  readonly height: number;
};

export type SiteManifestIcon = {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
};

/**
 * The wordmark is rendered as two adjacent text runs, not one string: the accent run
 * carries the heading-accent colour token. dose.wiki splits `dose` / `.wiki`; Effect Index
 * splits `Effect ` / `Index`. Consumers must not join these — the split *is* the design.
 */
export type SiteWordmark = {
  readonly lead: string;
  readonly accent: string;
};

/**
 * Optional pre-release badge rendered by `SiteVersionBadge` next to the brand lockups.
 * `null` ships no badge. Removing the badge at 1.0 is flipping this back to `null`
 * (and restoring the plain titles below).
 */
export type SiteVersionBadge = {
  /** Release-stage word, e.g. "beta". Rendered uppercase by the badge. */
  readonly label: string;
  /** Version string, e.g. "v0.9". Shown in the hero variant; omitted in the header. */
  readonly version: string;
} | null;

export type SiteLogoIdentity = {
  /**
   * Root-relative path to the mask asset, or `null` to use the bundled dose.wiki mark that
   * `DoseWikiLogo` imports through the asset pipeline. The mark is applied as a CSS
   * `mask-image` over `--theme-logo-fill`, so the source file's own fill colours never
   * reach the screen — only its alpha channel does.
   */
  readonly markPath: string | null;
  /** Accessible label for the chrome-sized mark. */
  readonly alt: string;
  /** Accessible label for the oversized homepage hero mark. */
  readonly heroAlt: string;
};

/**
 * A reuse-rights line: lead-in text, one link, trailing text. This is a legal statement,
 * not decoration: dose.wiki dedicates its own content to the public domain, Effect Index
 * licenses its material under CC BY-NC-SA 4.0. Shipping one flavor's wording on the other
 * would be a false claim. Used by both the footer and the About page's Open Data section.
 */
export type SiteLicenceNotice = {
  readonly leadIn: string;
  readonly linkLabel: string;
  readonly linkHref: string;
  /** `true` renders an `<a target="_blank">`; `false` renders an in-app `<Link>`. */
  readonly linkIsExternal: boolean;
  readonly trailing: string;
};

/**
 * A supporter credit. For now it is rendered on the About page only, not in the footer
 * or on the homepage.
 *
 * "Supported by", not "sponsored by" or "backed by": the named company pays for
 * infrastructure and holds no ownership, equity or editorial stake in the publication.
 * The stronger words would each assert a relationship that does not exist, so the credit
 * is deliberately the weakest accurate one — and the link carries no `rel="sponsored"`,
 * which is for paid placements and would withhold ordinary link equity from a supporter.
 *
 * This is an attribution claim, so it follows the publication: only a flavor that really
 * is supported declares one, and the rest set `null`. The mark is drawn as a CSS mask
 * over `currentColor` rather than as an `<img>`, so one monochrome asset reads correctly
 * in both the light and dark themes.
 */
export type SiteSupporterIdentity = {
  /** Lead-in text before the mark, e.g. "Supported by". */
  readonly prefix: string;
  /** The supporter's own site. Always rendered as an external link in a new tab. */
  readonly href: string;
  /** Accessible name for the mark; the prefix is read out separately. */
  readonly alt: string;
  /** Monochrome (white-on-transparent) wordmark served from `public/`. */
  readonly markPath: string;
  /** The mark's intrinsic ratio as a CSS `aspect-ratio` value; height drives the width. */
  readonly markAspectRatio: string;
};

export type SiteLoadingScreenCopy = {
  /**
   * Tailwind classes for the loading wordmark. It is a raw colour utility rather than a
   * theme token on dose.wiki, so it cannot follow the theme and has to be flavored here.
   */
  readonly wordmarkClassName: string;
  readonly statusLine: string;
  readonly captionLine: string;
};

/** One card in the About page's final tab. */
export type SiteAboutDocLink = {
  readonly href: string;
  /** Iconify name, e.g. `lucide:scale`. */
  readonly icon: string;
  readonly title: string;
  readonly description: string;
};

/** The About page's Contact & Feedback section: inbox + feedback form entry. */
export type SiteAboutContact = {
  /** Published inbox, rendered as visible text with a mailto link. */
  readonly email: string;
  /** Route of the general feedback form the section links to. */
  readonly feedbackHref: string;
};

/**
 * About page content that names the publication or states its terms.
 *
 * The `/docs/*` pages describe dose.wiki's pipeline, its codebase and its CC0/MIT terms.
 * None of that is true of Effect Index, which licenses its material under CC BY-NC-SA 4.0
 * and does not own that code — so the Effect Index build points the same cards at its own
 * copyright disclaimer and supporting pages instead of advertising dose.wiki's.
 */
export type SiteAboutConfig = {
  /** Reuse-rights sentence. Rendered under Open Data when that tab exists, else with the cards. */
  readonly reuseNotice: SiteLicenceNotice;
  /**
   * Mission-tab prose owned by this flavor, or `null` to render the CMS About document.
   *
   * The CMS document (`server/siteConfig`) is dose.wiki's: it names dose.wiki, links its
   * `/docs/*` pages and dedicates its content to the public domain under CC0. None of that
   * is true of Effect Index, whose material is CC BY-NC-SA 4.0 — rendering it there would
   * put two mutually exclusive licence claims on one page. A non-null value means this
   * flavor owns its About prose, so the CMS document's subtitle is not used either.
   */
  readonly missionMarkdown: string | null;
  /**
   * Whether the Open Data & Tools tab is shown. It ships dose.wiki-branded exports (the
   * molecule pack, `SubstanceIndex.json`, the dose.wiki GitHub repository), so it belongs
   * to that publication only; Effect Index has no equivalent downloads to offer yet.
   */
  readonly showOpenData: boolean;
  /**
   * Whether the Partners & Community roster is shown. It names dose.wiki's data
   * partners and neighbouring communities, so it belongs to that publication only.
   */
  readonly showCommunity: boolean;
  /** Heading for the final About tab's panel and its cards. */
  readonly docsTitle: string;
  readonly docLinks: readonly SiteAboutDocLink[];
  /**
   * Contact & Feedback section: the published inbox plus the entry to the general
   * feedback form, or `null` to omit the section. Effect Index routes contact through
   * its own /contact docs card and publishes no dose.wiki address.
   */
  readonly contact: SiteAboutContact | null;
};

/**
 * Everything that differs between the two publications, including their {@link
 * AppearancePolicy}: `defaultColorScheme`, `showColorSchemeToggle`, `defaultVisualStyle`,
 * `showVisualStyleToggle`, `showSurfacePicker`, `showAccentPicker` and `showFontToggle` are
 * contributed by that type rather than redeclared here, so the axis vocabulary has exactly
 * one owner.
 */
export type SiteFlavorConfig = AppearancePolicy & {
  /** The flavor this config describes. */
  readonly flavor: SiteFlavor;
  /** Display name, e.g. "dose.wiki". Use {@link SiteFlavorConfig.wordmark} to render it. */
  readonly name: string;
  /** Two-run wordmark used by the header, footer, homepage hero and construction chrome. */
  readonly wordmark: SiteWordmark;
  /** Pre-release badge shown beside the wordmark in the hero and header; null hides it. */
  readonly versionBadge: SiteVersionBadge;
  /** In-page logo mark: asset and accessible labels. */
  readonly logo: SiteLogoIdentity;
  /** Canonical public base URL used when `NEXT_PUBLIC_SITE_URL` is not set. */
  readonly defaultSiteUrl: string;
  /** Public production origin for this publication. */
  readonly launchSiteUrl: string;
  /** One-line description of the publication. */
  readonly description: string;
  /** Square logo served from `public/`. */
  readonly logoPath: string;
  /** Open Graph / Twitter card image served from `public/`. */
  readonly socialCard: SiteSocialCard;
  /** Browser-tab favicon served from `public/`, rendered as the root `<link rel="icon">`. */
  readonly faviconPath: string;
  /** iOS home-screen icon served from `public/`, rendered as `<link rel="apple-touch-icon">`. */
  readonly appleTouchIconPath: string;
  /**
   * Browser-tab title suffix appended by `buildPublicPageMetadata` — the single owner of
   * the " - <suffix>" convention every public route's title ends with. The homepage's
   * title is `homeTitle` instead, so the suffix stays clean on every other page.
   */
  readonly titleSuffix: string;
  /** Homepage title (browser tab + home metadata); carries the beta badge when set. */
  readonly homeTitle: string;
  /** About page title, used for both the metadata title and the page heading. */
  readonly aboutTitle: string;
  /** About page copy that states this publication's terms. */
  readonly about: SiteAboutConfig;
  /** Fallback description for an article slug that no longer resolves. */
  readonly articleFallbackDescription: string;
  /** Footer identity block. */
  readonly footer: {
    readonly tagline: string;
    readonly licence: SiteLicenceNotice;
    /** Supporter credit, or `null` when this publication has no supporter to name. */
    readonly supporter: SiteSupporterIdentity | null;
  };
  /** Full-screen loading indicator copy. */
  readonly loadingScreen: SiteLoadingScreenCopy;
  /**
   * Metadata description for the pre-launch holding page. The remit differs per
   * publication: dose.wiki describes a harm-reduction library, Effect Index a subjective
   * effect archive. Shipping one flavor's remit on the other would misstate what the site
   * is for. The page itself is the live homepage with its destinations blocked
   * (`ConstructionLanding`), so its visible copy comes from the homepage's own copy
   * blocks, not from here.
   */
  readonly underConstructionDescription: string;
  /** Ordered primary (header) navigation ids. */
  readonly primaryNavIds: readonly SiteNavId[];
  /** Ordered secondary (utility) navigation ids. */
  readonly secondaryNavIds: readonly SiteNavId[];
  /** Ordered homepage quick-link ids. */
  readonly quickLinkIds: readonly SiteNavId[];
  /**
   * Per-item label overrides and dropdown children, keyed by nav id. Ids absent from this
   * map render exactly as the registry defines them, with no dropdown — which is dose.wiki's
   * entire header, so it declares `{}`.
   */
  readonly navMenus: Readonly<Partial<Record<SiteNavId, SiteNavMenu>>>;
  /** Flavor-gated routes enabled for this flavor. */
  readonly flavorGatedRoutes: readonly FlavorGatedRoute[];
  /** Root layout `<head>` identity. */
  readonly rootMetadata: {
    readonly title: string;
    readonly description: string;
    readonly openGraphDescription: string;
    readonly twitterDescription: string;
    readonly keywords: readonly string[];
  };
  /** Organisation names used by JSON-LD structured data. */
  readonly organization: {
    readonly publisherName: string;
    readonly contributorsName: string;
    readonly subjectiveEffectIndexName: string;
  };
  /** Web app manifest identity. */
  readonly manifest: {
    readonly name: string;
    readonly shortName: string;
    readonly backgroundColor: string;
    readonly themeColor: string;
    readonly icons: readonly SiteManifestIcon[];
  };
};

const DOSEWIKI_CONFIG: SiteFlavorConfig = {
  flavor: "dosewiki",
  name: "dose.wiki",
  wordmark: { lead: "dose", accent: ".wiki" },
  versionBadge: { label: msg("beta"), version: "v0.9" },
  logo: {
    markPath: null,
    alt: msg("dose.wiki logo"),
    heroAlt: msg("dose.wiki molecule logo"),
  },
  defaultSiteUrl: "https://dose.wiki",
  launchSiteUrl: "https://dose.wiki",
  description: "An open encyclopedic database for the study of psychopharmacology",
  logoPath: "/icon-512.png",
  socialCard: { path: "/icon-512.png", width: 512, height: 512 },
  faviconPath: "/favicon.svg",
  appleTouchIconPath: "/apple-touch-icon.png",
  titleSuffix: "dose.wiki",
  homeTitle: "dose.wiki (beta v0.9)",
  aboutTitle: "About dose.wiki",
  about: {
    reuseNotice: {
      leadIn: msg(
        "dose.wiki's own writing, dataset schema, and normalization work are dedicated to the public domain under",
      ),
      linkLabel: msg("CC0"),
      linkHref: "/docs/license",
      linkIsExternal: false,
      trailing: msg(
        ". Downloads also include third-party material with separate terms. See the license page before reusing it.",
      ),
    },
    // dose.wiki's About prose is editor-managed in Postgres.
    missionMarkdown: null,
    showOpenData: true,
    showCommunity: true,
    docsTitle: msg("Documentation"),
    docLinks: [
      {
        href: "/docs/how",
        icon: "lucide:workflow",
        title: msg("How articles are made"),
        description: msg(
          "Sources, AI drafting, human review, and citation checks for substance articles.",
        ),
      },
      {
        href: "/docs/code",
        icon: "lucide:code-2",
        title: msg("How dose.wiki is built"),
        description: msg(
          "The codebase, data layer, and systems behind the site.",
        ),
      },
      {
        href: "/docs/license",
        icon: "lucide:scale",
        title: msg("License & reuse"),
        description: msg(
          "Reuse terms for our writing, datasets, code, and third-party material.",
        ),
      },
    ],
    contact: {
      email: "contact@dose.wiki",
      feedbackHref: "/about/feedback",
    },
  },
  articleFallbackDescription: "Browse Effect Index articles in dose.wiki.",
  footer: {
    tagline: msg(
      "dose.wiki does not endorse or warrant the accuracy or safety of the information published here. Its articles, reports, and data describe substances and individual experiences and must not be read as medical advice, dosing recommendations, or a representation that any substance or dose is safe.\n\ndose.wiki is an independently governed repository of psychoactive-substance information and first-person experiences. Its operations, content policies, and editorial decisions are its own.",
    ),
    licence: {
      leadIn: msg(
        "Mixed licenses, mostly open: MIT code, CC0 writing, third-party material on its own terms. See",
      ),
      linkLabel: msg("License & reuse"),
      linkHref: "/docs/license",
      linkIsExternal: false,
      trailing: msg("."),
    },
    // Mindstate Design Labs pays dose.wiki's infrastructure bills and shares a founder
    // with it, but does not own or direct the publication — hence "Supported by".
    supporter: {
      prefix: msg("Supported by"),
      href: "https://mindstate.design",
      alt: "Mindstate Design Labs",
      markPath: "/supporters/mindstate-design-labs.webp",
      markAspectRatio: "768 / 178",
    },
  },
  loadingScreen: {
    wordmarkClassName: "text-dose-accent",
    statusLine: "Indexing dosage, effects, and safety references…",
    captionLine: "Preparing the public library",
  },
  underConstructionDescription: "dose.wiki is preparing its public harm-reduction library.",
  primaryNavIds: ["substances", "effects", "reports", "replications"],
  secondaryNavIds: ["about"],
  quickLinkIds: ["substances", "effects", "reports", "replications", "about"],
  // dose.wiki's header is flat: every top-level item is a plain link to its section.
  navMenus: {},
  // Dark-first cosmic-laboratory identity, and the only publication that offers the Fun/Pro
  // choice: Pro is a selectable presentation here, not an imported build identity. The accent
  // axis is offered for the same reason — it re-tints a presentation without touching
  // publication identity, so a reader may wear whichever hue they like.
  defaultColorScheme: "dark",
  showColorSchemeToggle: true,
  defaultVisualStyle: "fun",
  showVisualStyleToggle: true,
  // dose.wiki opens on the authored base look — Orchid's plum with the Default accent —
  // shifted only by the site-default saturation levels and zero hue rotation the bootstrap
  // applies (`src/theme/appearanceChroma.ts`). The pickers are continuous hue sliders now;
  // a reader's saved legacy colourway id still restores via the migration tables in
  // `src/theme/surfaces.ts` / `src/theme/accents.ts`.
  showSurfacePicker: true,
  showAccentPicker: true,
  // The dyslexic-type toggle (Lexend) is a reader preference on the same terms as the
  // Fun/Pro choice, so this publication offers it.
  showFontToggle: true,
  // dose.wiki owns `/blog` too now — its own blog, written in the /dev Blog tab
  // and stored as `kind: "blog"` rows of `effectIndexArticles`. It is a
  // different publication from the frozen Effect Index archive that the same
  // path serves on the other flavor; both builds serve `/blog`, neither serves
  // the other's posts. Listing the route here is what stops the middleware
  // (`isFlavorGatedRequestPath`) from 404ing it before it renders.
  // `dev` is the editor shell; see the decision on `FlavorGatedRoute`.
  flavorGatedRoutes: ["blog", "dev"],
  rootMetadata: {
    title: "dose.wiki (beta v0.9)",
    description:
      "dose.wiki is a harm reduction database providing dosage, duration, effects, and safety information for psychoactive substances.",
    openGraphDescription:
      "Harm reduction database providing dosage, duration, effects, and safety information for psychoactive substances.",
    twitterDescription: "Harm reduction database for psychoactive substances.",
    keywords: [
      "harm reduction",
      "drug information",
      "dosage",
      "psychoactive substances",
      "drug safety",
      "effects",
      "interactions",
    ],
  },
  organization: {
    publisherName: "dose.wiki",
    contributorsName: "dose.wiki Contributors",
    subjectiveEffectIndexName: "dose.wiki Subjective Effect Index",
  },
  manifest: {
    name: "dose.wiki",
    shortName: "dose.wiki",
    backgroundColor: "#0f0a1f",
    themeColor: "#0f0a1f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

const EFFECT_INDEX_DESCRIPTION =
  "A resource dedicated to establishing the field of formalised subjective effect documentation.";

/**
 * Effect Index's About prose, ported from the old site's `pages/about.vue` and kept in
 * `content/about/effect-index-mission.md`. Held there rather than read from Postgres
 * because the CMS About document is dose.wiki's and states dose.wiki's CC0 terms; see
 * {@link SiteAboutConfig.missionMarkdown}. Internal links are remapped to this codebase's
 * routes (`/profiles/Josie` becomes `/contributors/josie`).
 */
const EFFECT_INDEX_MISSION_MARKDOWN = effectIndexMissionMarkdown.trim();

const EFFECT_INDEX_CONFIG: SiteFlavorConfig = {
  flavor: "effectindex",
  name: "Effect Index",
  wordmark: { lead: "Effect ", accent: "Index" },
  versionBadge: null,
  logo: {
    // Eye-only extraction of the old lockup; the original also contains the words
    // "Effect Index", which would print the wordmark twice next to the text wordmark.
    markPath: "/effectindex/logo.svg",
    alt: "An eye, the Effect Index logo",
    heroAlt: "An eye, the Effect Index logo",
  },
  defaultSiteUrl: "https://effectindex.com",
  launchSiteUrl: "https://effectindex.com",
  description: EFFECT_INDEX_DESCRIPTION,
  logoPath: "/effectindex/icon.png",
  socialCard: { path: "/effectindex/social-card.png", width: 600, height: 315 },
  // A 32px derivative of the eye icon, pre-scaled so the tab icon stays crisp; the
  // full 512px PNG remains the home-screen icon, where the extra detail matters.
  faviconPath: "/effectindex/favicon.png",
  appleTouchIconPath: "/effectindex/icon.png",
  titleSuffix: "Effect Index",
  homeTitle: "Effect Index",
  aboutTitle: "About Effect Index",
  about: {
    // dose.wiki's CC0/MIT dedication is not Effect Index's licence, and the `/docs/*`
    // pages that state it describe dose.wiki's own pipeline and codebase. Both the
    // sentence and the cards point at the copyright disclaimer instead.
    reuseNotice: {
      leadIn: msg(
        "Effect Index's indexing and written material is available for non-commercial reuse under",
      ),
      linkLabel: msg("CC BY-NC-SA 4.0"),
      linkHref: "/copyright-disclaimer",
      linkIsExternal: false,
      trailing: msg(
        ", with attribution. Replications, multimedia and non-SEI artwork belong to their original creators; the copyright disclaimer covers commercial enquiries and how to request that artwork be removed or reattributed.",
      ),
    },
    missionMarkdown: EFFECT_INDEX_MISSION_MARKDOWN,
    // The Open Data tab's exports are dose.wiki's own (molecule pack, SubstanceIndex.json,
    // the dose.wiki repository). Effect Index has none of them to offer.
    showOpenData: false,
    // Partners & Community is dose.wiki's partner and community roster.
    showCommunity: false,
    docsTitle: msg("Licensing & Contact"),
    docLinks: [
      {
        href: "/copyright-disclaimer",
        icon: "lucide:scale",
        title: msg("Copyright disclaimer"),
        description: msg(
          "The licence covering Effect Index material, and how to request artwork removal or reattribution.",
        ),
      },
      {
        href: "/contact",
        icon: "lucide:mail",
        title: msg("Contact us"),
        description: msg(
          "How to reach the Effect Index staff, and the site founder directly.",
        ),
      },
      {
        href: "/discord",
        icon: "simple-icons:discord",
        title: msg("Discord community"),
        description: msg(
          "The project's semi-private Discord: what it is for, how to join, and its rules.",
        ),
      },
      {
        href: "/donate",
        icon: "lucide:heart",
        title: msg("Donate"),
        description: msg(
          "Patreon, merchandise, PayPal and Ethereum — what the funds pay for, and how to give.",
        ),
      },
    ],
    // Effect Index's contact instructions live on its own /contact page, carded above.
    contact: null,
  },
  articleFallbackDescription: "Browse the Effect Index article archive.",
  footer: {
    tagline: "Formalised documentation of subjective effects. Not medical advice.",
    licence: {
      leadIn: "Content is licensed under",
      linkLabel: "CC BY-NC-SA 4.0",
      linkHref: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      linkIsExternal: true,
      trailing: "for non-commercial reuse with attribution.",
    },
    // Effect Index carries no supporter credit: the support named on dose.wiki is that
    // publication's, and printing it here would claim funding this archive has not had.
    supporter: null,
  },
  loadingScreen: {
    wordmarkClassName: "theme-accent-heading",
    statusLine: "Indexing subjective effects, replications, and reports…",
    captionLine: "Preparing the public library",
  },
  underConstructionDescription:
    "Effect Index is preparing its public archive of subjective effect documentation.",
  // The original effectindex.com header, restored from that site's `store/navigation.json`,
  // ran Effects · Replications · Trip Reports · Project. Substances has since been added
  // between Replications and Trip Reports on the owner's instruction, linking the live
  // `/substances` index; the homepage tile grid still omits it.
  //
  // The original also led with a Home item. It is gone on the owner's instruction: the
  // wordmark and eye mark beside it are already a link to `/` at every width, so a Home entry
  // spent a nav slot on the one destination the chrome can never lose.
  primaryNavIds: ["effects", "replications", "substances", "reports"],
  secondaryNavIds: ["about"],
  quickLinkIds: ["effects", "replications", "reports", "about"],
  navMenus: {
    effects: {
      children: [
        { label: "Index", href: "/effects" },
        // Group routes let the server emit the selected Effect Index projection
        // in the first response; fragments are reserved for real page anchors.
        { label: "Sensory", href: effectIndexViewPath("sensory") },
        { label: "Cognitive", href: effectIndexViewPath("cognitive") },
        { label: "Physical", href: effectIndexViewPath("physical") },
      ],
    },
    replications: {
      children: [
        { label: "Gallery", href: "/replications" },
        { label: "Audio", href: "/replications/audio" },
        { label: "Subreddit", href: "https://reddit.com/r/replications", external: true },
        { label: "Tutorials", href: "/replications/tutorials" },
      ],
    },
    // A single child identical to its parent, as the original had it: on touch the parent
    // row expands instead of navigating, so without the self-child /reports would be
    // unreachable from the menu.
    reports: {
      label: "Trip Reports",
      children: [{ label: "Trip Reports", href: "/reports" }],
    },
    // "Project" is the umbrella the original used to keep Articles, Blog and Search
    // reachable without spending a top-level slot on each.
    about: {
      label: "Project",
      children: [
        { label: "About", href: "/about" },
        { label: "Articles", href: "/articles" },
        { label: "Blog", href: "/blog" },
        { label: "Search", href: "/search" },
        { label: "Github", href: "https://github.com/josikinzz/EffectIndex2.0", external: true },
      ],
    },
  },
  // Pro is this publication's identity, so the style is locked and its storage key is never
  // read; day/night stays a reader preference, which is new and deliberate. The accent is
  // locked for the identity reason too: Effect Index's teal is the archive's own colour, and a
  // lock means its storage key never appears in the emitted script, so a dose.wiki reader's
  // accent cannot follow them here. The accent stylesheet is not imported on this flavor
  // either, so the bytes are not merely inert, they are absent.
  defaultColorScheme: "light",
  showColorSchemeToggle: true,
  defaultVisualStyle: "pro",
  showVisualStyleToggle: false,
  showSurfacePicker: false,
  showAccentPicker: false,
  // The type axis is locked for the identity reason the style is: this archive is set in
  // Titillium, and a lock keeps its key out of the emitted bootstrap so the pinned CSP
  // hash — and a dose.wiki reader's saved preference — stay untouched here.
  showFontToggle: false,
  // No `dev`: this deployment is credential-free and read-only, so the editor shell
  // does not exist here and the whole `/dev` prefix answers a real 404.
  flavorGatedRoutes: ["blog", "donate", "contact", "discord", "copyrightDisclaimer"],
  rootMetadata: {
    title: "Effect Index",
    description: EFFECT_INDEX_DESCRIPTION,
    openGraphDescription: EFFECT_INDEX_DESCRIPTION,
    twitterDescription: EFFECT_INDEX_DESCRIPTION,
    keywords: [
      "subjective effects",
      "psychedelic phenomenology",
      "effect index",
      "hallucinogens",
      "replications",
      "trip reports",
    ],
  },
  organization: {
    publisherName: "Effect Index",
    contributorsName: "Effect Index Contributors",
    subjectiveEffectIndexName: "Subjective Effect Index",
  },
  manifest: {
    name: "Effect Index",
    shortName: "Effect Index",
    backgroundColor: "#f8f4ea",
    themeColor: "#f8f4ea",
    icons: [{ src: "/effectindex/icon.png", sizes: "512x512", type: "image/png" }],
  },
};

export const SITE_FLAVOR_CONFIGS: Readonly<Record<SiteFlavor, SiteFlavorConfig>> = {
  dosewiki: DOSEWIKI_CONFIG,
  effectindex: EFFECT_INDEX_CONFIG,
};

function isSiteFlavor(value: string): value is SiteFlavor {
  return (SITE_FLAVORS as readonly string[]).includes(value);
}

/**
 * Pure resolver: unset, empty, whitespace-only or unrecognised values fall back to the
 * dose.wiki flavor. The default argument reads the ambient environment inline so tests can
 * reach either flavor without mutating `process.env`.
 */
export function resolveSiteFlavor(
  // `NEXT_PUBLIC_*` is the Next.js contract for build-time inlining into client bundles;
  // `import.meta.env` is a Vite concept and does not exist here.
   
  env: SiteFlavorEnv = { NEXT_PUBLIC_SITE_FLAVOR: process.env.NEXT_PUBLIC_SITE_FLAVOR },
): SiteFlavor {
  const normalized = env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() ?? "";

  return isSiteFlavor(normalized) ? normalized : DEFAULT_SITE_FLAVOR;
}

/** Resolve the full config for an environment-shaped object. */
export function getSiteFlavorConfig(env?: SiteFlavorEnv): SiteFlavorConfig {
  return SITE_FLAVOR_CONFIGS[resolveSiteFlavor(env)];
}

/** The ambient (build-time) flavor config. */
export const SITE_FLAVOR_CONFIG: SiteFlavorConfig = getSiteFlavorConfig();

/** The ambient (build-time) flavor. */
export const SITE_FLAVOR: SiteFlavor = SITE_FLAVOR_CONFIG.flavor;

export function isEffectIndex(config: SiteFlavorConfig = SITE_FLAVOR_CONFIG): boolean {
  return config.flavor === "effectindex";
}

export function isFlavorRouteEnabled(
  route: FlavorGatedRoute,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): boolean {
  return config.flavorGatedRoutes.includes(route);
}

/**
 * Route guard for Effect Index-only pages. Raises Next's not-found on any other flavor, so
 * a dose.wiki build serves a 404 for routes that only that publication owns.
 */
export function requireEffectIndexFlavor(config: SiteFlavorConfig = SITE_FLAVOR_CONFIG): void {
  if (!isEffectIndex(config)) {
    notFound();
  }
}
