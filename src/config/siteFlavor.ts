import { notFound } from "next/navigation";
import type { AppearancePolicy } from "@/theme";
import { effectIndexViewPath } from "@/utils/indexViewRoutes";
import { msg } from "@/i18n/messages";
import effectIndexMissionMarkdown from "@content/about/effect-index-mission.md?raw";
import {
  DEFAULT_SITE_FLAVOR,
  SITE_FLAVORS,
  normalizeSiteFlavor,
  type SiteFlavorName,
} from "../../scripts/build/build-surface.mjs";

export { DEFAULT_SITE_FLAVOR, SITE_FLAVORS };

export type SiteFlavor = SiteFlavorName;

export type SiteFlavorEnv = {
  NEXT_PUBLIC_SITE_FLAVOR?: string;
};

export type SiteNavId = "substances" | "effects" | "replications" | "reports" | "about";

export type SiteNavChild = {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
};

export type SiteNavMenu = {
  readonly label?: string;
  readonly children?: readonly SiteNavChild[];
};

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

export type SiteWordmark = {
  readonly lead: string;
  readonly accent: string;
};

export type SiteVersionBadge = {
  readonly label: string;
  readonly version: string;
} | null;

export type SiteLogoIdentity = {
  readonly markPath: string | null;
  readonly alt: string;
  readonly heroAlt: string;
};

export type SiteLicenceNotice = {
  readonly leadIn: string;
  readonly linkLabel: string;
  readonly linkHref: string;
  readonly linkIsExternal: boolean;
  readonly trailing: string;
};

export type SiteSupporterIdentity = {
  readonly prefix: string;
  readonly href: string;
  readonly alt: string;
  readonly markPath: string;
  readonly markAspectRatio: string;
};

export type SiteLoadingScreenCopy = {
  readonly wordmarkClassName: string;
  readonly statusLine: string;
  readonly captionLine: string;
};

export type SiteAboutDocLink = {
  readonly href: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
};

export type SiteAboutContact = {
  readonly email: string;
  readonly feedbackHref: string;
};

export type SiteAboutConfig = {
  readonly reuseNotice: SiteLicenceNotice;
  readonly missionMarkdown: string | null;
  readonly showOpenData: boolean;
  readonly showCommunity: boolean;
  readonly showCollaborations: boolean;
  readonly docsTitle: string;
  readonly docLinks: readonly SiteAboutDocLink[];
  readonly contact: SiteAboutContact | null;
};

export type SiteFlavorConfig = AppearancePolicy & {
  readonly flavor: SiteFlavor;
  readonly name: string;
  readonly wordmark: SiteWordmark;
  readonly versionBadge: SiteVersionBadge;
  readonly logo: SiteLogoIdentity;
  readonly defaultSiteUrl: string;
  readonly launchSiteUrl: string;
  readonly description: string;
  readonly logoPath: string;
  readonly socialCard: SiteSocialCard;
  readonly faviconPath: string;
  readonly appleTouchIconPath: string;
  readonly titleSuffix: string;
  readonly homeTitle: string;
  readonly aboutTitle: string;
  readonly about: SiteAboutConfig;
  readonly articleFallbackDescription: string;
  readonly showPiruLinks: boolean;
  readonly footer: {
    readonly tagline: string;
    readonly licence: SiteLicenceNotice;
    readonly supporter: SiteSupporterIdentity | null;
  };
  readonly loadingScreen: SiteLoadingScreenCopy;
  readonly underConstructionDescription: string;
  readonly primaryNavIds: readonly SiteNavId[];
  readonly secondaryNavIds: readonly SiteNavId[];
  readonly quickLinkIds: readonly SiteNavId[];
  readonly navMenus: Readonly<Partial<Record<SiteNavId, SiteNavMenu>>>;
  readonly flavorGatedRoutes: readonly FlavorGatedRoute[];
  readonly rootMetadata: {
    readonly title: string;
    readonly description: string;
    readonly openGraphDescription: string;
    readonly twitterDescription: string;
    readonly keywords: readonly string[];
  };
  readonly organization: {
    readonly publisherName: string;
    readonly contributorsName: string;
    readonly subjectiveEffectIndexName: string;
  };
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
    missionMarkdown: null,
    showOpenData: true,
    showCommunity: true,
    showCollaborations: true,
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
  showPiruLinks: true,
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
  navMenus: {},
  defaultColorScheme: "dark",
  showColorSchemeToggle: true,
  defaultVisualStyle: "fun",
  showVisualStyleToggle: true,
  showSurfacePicker: true,
  showAccentPicker: true,
  showFontToggle: true,
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

const EFFECT_INDEX_MISSION_MARKDOWN = effectIndexMissionMarkdown.trim();

const EFFECT_INDEX_CONFIG: SiteFlavorConfig = {
  flavor: "effectindex",
  name: "Effect Index",
  wordmark: { lead: "Effect ", accent: "Index" },
  versionBadge: null,
  logo: {
    markPath: "/effectindex/logo.svg",
    alt: "An eye, the Effect Index logo",
    heroAlt: "An eye, the Effect Index logo",
  },
  defaultSiteUrl: "https://effectindex.com",
  launchSiteUrl: "https://effectindex.com",
  description: EFFECT_INDEX_DESCRIPTION,
  logoPath: "/effectindex/icon.png",
  socialCard: { path: "/effectindex/social-card.png", width: 600, height: 315 },
  faviconPath: "/effectindex/favicon.png",
  appleTouchIconPath: "/effectindex/icon.png",
  titleSuffix: "Effect Index",
  homeTitle: "Effect Index",
  aboutTitle: "About Effect Index",
  about: {
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
    showOpenData: false,
    showCommunity: false,
    showCollaborations: false,
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
          "Patreon, merchandise, PayPal and Ethereum: what the funds pay for, and how to give.",
        ),
      },
    ],
    contact: null,
  },
  articleFallbackDescription: "Browse the Effect Index article archive.",
  showPiruLinks: false,
  footer: {
    tagline: "Formalised documentation of subjective effects. Not medical advice.",
    licence: {
      leadIn: "Content is licensed under",
      linkLabel: "CC BY-NC-SA 4.0",
      linkHref: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      linkIsExternal: true,
      trailing: "for non-commercial reuse with attribution.",
    },
    supporter: null,
  },
  loadingScreen: {
    wordmarkClassName: "theme-accent-heading",
    statusLine: "Indexing subjective effects, replications, and reports…",
    captionLine: "Preparing the public library",
  },
  underConstructionDescription:
    "Effect Index is preparing its public archive of subjective effect documentation.",
  primaryNavIds: ["effects", "replications", "substances", "reports"],
  secondaryNavIds: ["about"],
  quickLinkIds: ["effects", "replications", "reports", "about"],
  navMenus: {
    effects: {
      children: [
        { label: "Index", href: "/effects" },
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
    reports: {
      label: "Trip Reports",
      children: [{ label: "Trip Reports", href: "/reports" }],
    },
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
  defaultColorScheme: "light",
  showColorSchemeToggle: true,
  defaultVisualStyle: "pro",
  showVisualStyleToggle: false,
  showSurfacePicker: false,
  showAccentPicker: false,
  showFontToggle: false,
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

export function resolveSiteFlavor(

  env: SiteFlavorEnv = { NEXT_PUBLIC_SITE_FLAVOR: process.env.NEXT_PUBLIC_SITE_FLAVOR },
): SiteFlavor {
  return normalizeSiteFlavor(env.NEXT_PUBLIC_SITE_FLAVOR);
}

export function getSiteFlavorConfig(env?: SiteFlavorEnv): SiteFlavorConfig {
  return SITE_FLAVOR_CONFIGS[resolveSiteFlavor(env)];
}

export const SITE_FLAVOR_CONFIG: SiteFlavorConfig = getSiteFlavorConfig();

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

export function requireEffectIndexFlavor(config: SiteFlavorConfig = SITE_FLAVOR_CONFIG): void {
  if (!isEffectIndex(config)) {
    notFound();
  }
}
