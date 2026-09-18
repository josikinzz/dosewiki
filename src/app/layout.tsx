import type { Metadata } from "next";
import Script from "next/script";
import { PUBLIC_SITE, buildSiteAssetUrl, buildSiteUrl } from "@server/next/publicSite";
import { SITE_FLAVOR, SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { buildZodJitlessBootstrapScript } from "@server/next/zodBrowserPolicy";
import {
  THEME_META_ID,
  buildThemeBootstrapScript,
  getAppearanceMetaColor,
  getInitialAppearance,
} from "@/theme";
import {
  CHROMA_STYLESHEET_HREF,
  CHROMA_STYLESHEET_LINK_ID,
} from "@/theme/appearanceChroma";
import {
  LIGHT_MODE_STYLESHEET_HREF,
  LIGHT_MODE_STYLESHEET_LINK_ID,
  PRO_THEME_STYLESHEET_HREF,
  PRO_THEME_STYLESHEET_LINK_ID,
} from "@/theme/appearanceSheets";
import { DocumentRuntime } from "./_components/DocumentRuntime";
import { bodyFont, bodyItalicFace, dyslexicFont, proFont, siteFont } from "./fonts";
import "@site-styles";
import themeLabBootstrap from "@/features/theme-lab/themeLabBootstrap.generated.json";

// One appearance policy feeds all three resolvers, so they cannot disagree: the server
// renders both root attributes and the matching browser-chrome tint, the pre-paint script
// re-resolves each axis from storage, and the provider adopts whatever was painted.
const initialAppearance = getInitialAppearance();
const initialThemeMetaColor = getAppearanceMetaColor(initialAppearance);
const themeBootstrap = buildThemeBootstrapScript();
// The chroma sheet is inert without html[data-chroma], and only the bootstrap's chromaWrite
// block — emitted when at least one colour picker is unlocked — ever sets that attribute.
// Effect Index locks both pickers, so its build skips the <link> rather than shipping 70 KB
// of CSS no selector can ever match.
const rendersChromaStylesheet =
  SITE_FLAVOR_CONFIG.showSurfacePicker || SITE_FLAVOR_CONFIG.showAccentPicker;
const zodJitlessBootstrap = buildZodJitlessBootstrapScript();
// Both faces are registered in both builds so the Fun/Pro choice is a style switch, not a
// reload. `proFont` sets `preload: false`, so a Fun reader downloads none of it. Lexend —
// the default reading face — rides the same mechanism where the flavor offers the font
// axis (null where it does not): preloaded, because it paints on every page. The Inter
// body face is dose.wiki's alone (null on Effect Index, whose body face is its display
// face) and, like the display face, is preloaded: it paints on every page.
const rootFontClassName = [
  siteFont.variable,
  bodyFont?.variable,
  proFont.variable,
  dyslexicFont?.variable,
]
  .filter(Boolean)
  .join(" ");

export const metadata: Metadata = {
  title: SITE_FLAVOR_CONFIG.rootMetadata.title,
  description: SITE_FLAVOR_CONFIG.rootMetadata.description,
  keywords: [...SITE_FLAVOR_CONFIG.rootMetadata.keywords],
  authors: [{ name: SITE_FLAVOR_CONFIG.organization.contributorsName }],
  metadataBase: new URL(PUBLIC_SITE.url),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: PUBLIC_SITE.name,
    title: SITE_FLAVOR_CONFIG.rootMetadata.title,
    description: SITE_FLAVOR_CONFIG.rootMetadata.openGraphDescription,
    url: buildSiteUrl("/"),
    images: [
      {
        url: buildSiteAssetUrl(PUBLIC_SITE.socialCard.path),
        width: PUBLIC_SITE.socialCard.width,
        height: PUBLIC_SITE.socialCard.height,
        alt: `${PUBLIC_SITE.name} logo`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_FLAVOR_CONFIG.rootMetadata.title,
    description: SITE_FLAVOR_CONFIG.rootMetadata.twitterDescription,
    images: [buildSiteAssetUrl(PUBLIC_SITE.socialCard.path)],
  },
  icons: {
    icon: SITE_FLAVOR_CONFIG.faviconPath,
    apple: SITE_FLAVOR_CONFIG.appleTouchIconPath,
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-site={SITE_FLAVOR}
      data-theme={initialAppearance.colorScheme}
      data-visual-style={initialAppearance.visualStyle}
      suppressHydrationWarning
      className={rootFontClassName}
    >
      <head>
        <meta id={THEME_META_ID} name="theme-color" content={initialThemeMetaColor} />
        {bodyItalicFace ? <style data-body-italic-face>{bodyItalicFace}</style> : null}
        {/* Literal repository icons are bundled offline. Runtime Iconify fallback
            remains available for exceptional editor-authored database strings and
            development pickers without speculatively opening an API connection on
            every public document. */}
        {/* The attribute-gated appearance sheets, server-rendered only when the flavor's
            DEFAULT appearance needs them (a saved preference the server cannot see is the
            bootstrap's job, same guarded link ids). dose.wiki opens fun+dark and renders
            neither — that is the point of moving them out of the bundled chain — while
            Effect Index (pro, light) renders both. Order is a cascade contract: light-mode
            before Pro (pro-theme.css re-overrides equal-specificity light rules by source
            order alone), both before the chroma sheet that re-tints their tokens. */}
        {initialAppearance.colorScheme === "light" ? (
          <link
            id={LIGHT_MODE_STYLESHEET_LINK_ID}
            rel="stylesheet"
            href={LIGHT_MODE_STYLESHEET_HREF}
          />
        ) : null}
        {initialAppearance.visualStyle === "pro" ? (
          <link id={PRO_THEME_STYLESHEET_LINK_ID} rel="stylesheet" href={PRO_THEME_STYLESHEET_HREF} />
        ) : null}
        {/* Server-rendered, and rendered *before* the bootstrap, on purpose: authored HTML
            is visible to the preload scanner, so the sheet downloads in parallel with the
            document instead of becoming a serial critical request discovered only when the
            inline script executes. The bootstrap and provider both check for this id before
            creating a link, so this is the only copy a reader ever fetches; next.config.ts
            serves it immutable, keyed on the href's ?v= content hash. It is safe to render
            unconditionally: the sheet is wrapped in @supports on the relative-colour grammar
            it needs, so a browser that cannot parse it (Safari 16.x) fetches an inert file
            while the bootstrap, probing the same grammar, never engages data-chroma. */}
        {rendersChromaStylesheet ? (
          <link id={CHROMA_STYLESHEET_LINK_ID} rel="stylesheet" href={CHROMA_STYLESHEET_HREF} />
        ) : null}
        {/* Raw inline, in <head>, on purpose: `next/script`'s beforeInteractive strategy
            compiles to a body-side queue push, which runs after the head has been parsed
            and so cannot be a *pre*-paint restore. This script is the only thing standing
            between a reader with a saved preference and a frame of the wrong appearance. */}
        <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {SITE_FLAVOR === "dosewiki" ? (
          <script id="theme-lab-bootstrap" dangerouslySetInnerHTML={{ __html: themeLabBootstrap.script }} />
        ) : null}
      </head>
      <body className="app-container theme-page-shell relative">
        <Script id="zod-jitless-bootstrap" strategy="beforeInteractive">
          {zodJitlessBootstrap}
        </Script>
        <DocumentRuntime>{children}</DocumentRuntime>
      </body>
    </html>
  );
}
