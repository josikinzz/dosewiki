import type { Metadata } from "next";
import { env } from "node:process";
import Script from "next/script";
import { PUBLIC_SITE, buildSiteAssetUrl, buildSiteUrl } from "@server/next/publicSite";
import { SITE_FLAVOR, SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { buildZodJitlessBootstrapScript } from "@server/next/zodBrowserPolicy";
import {
  THEME_META_ID,
  buildThemeBootstrapScript,
  getInitialTheme,
  getThemeMetaColor,
} from "@/theme";
import { buildPaletteLabBootstrapScript } from "@/features/theme-lab/paletteLabBootstrap";
import { siteFont } from "./fonts";
import { RouteChrome, RouteFooter } from "./_components/RouteChrome";
import { ApprovedPublicAnalytics } from "./_components/ApprovedPublicAnalytics";
import { PaletteLab } from "@/features/theme-lab";
import "@site-styles";

// Both read the flavor's `lockedTheme`: the bootstrap applies it without consulting the
// stored preference, and the layout renders the matching theme-colour meta value (plus a
// server-rendered `data-theme`) so a locked flavor never paints the wrong theme first.
const themeBootstrap = buildThemeBootstrapScript();
const initialTheme = getInitialTheme();
const initialThemeMetaColor = getThemeMetaColor(initialTheme);
const lockedTheme = SITE_FLAVOR_CONFIG.lockedTheme ?? undefined;
const zodJitlessBootstrap = buildZodJitlessBootstrapScript();
// Only the flavor that offers the lab: Effect Index wears a locked skin, never
// mounts the lab, and must keep its head byte-identical.
const paletteLabBootstrap = isEffectIndex() ? null : buildPaletteLabBootstrapScript();
const homeConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

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
      data-theme={lockedTheme}
      suppressHydrationWarning
      className={siteFont.variable}
    >
      <head>
        <meta id={THEME_META_ID} name="theme-color" content={initialThemeMetaColor} />
        {/* Raw inline, in <head>, on purpose: `next/script`'s beforeInteractive
            strategy compiles to a body-side queue push, which is after the head
            has been parsed and so cannot be a *pre*-paint restore. Rendered
            after the stylesheet links, so the element it injects lands later in
            the head and its rules win ties against the compiled preset blocks. */}
        {paletteLabBootstrap ? (
          <script
            id="palette-lab-bootstrap"
            dangerouslySetInnerHTML={{ __html: paletteLabBootstrap }}
          />
        ) : null}
      </head>
      <body className="app-container theme-page-shell relative">
        <Script id="zod-jitless-bootstrap" strategy="beforeInteractive">
          {zodJitlessBootstrap}
        </Script>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
        <ApprovedPublicAnalytics />
        <span data-nosnippet>
          <a
            href="#main-content"
            className="theme-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 focus:ring-offset-2"
          >
            Skip to main content
          </a>
        </span>
        <RouteChrome homeConstructionMode={homeConstructionMode} />
        <div className="app-content relative">
          <div className="flex-1">
            {children}
          </div>
          <RouteFooter />
        </div>
        {/* Single global instance: a right-docked sidebar that persists across
            navigation (including the homepage) and portals itself to <body>. */}
        <PaletteLab />
      </body>
    </html>
  );
}
