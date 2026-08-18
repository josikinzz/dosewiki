import type { Metadata } from "next";
import { env } from "node:process";
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
import { ThemeProvider } from "@/context/ThemeContext";
import { proFont, siteFont } from "./fonts";
import { RouteChrome, RouteFooter } from "./_components/RouteChrome";
import { ApprovedPublicAnalytics } from "./_components/ApprovedPublicAnalytics";
import "@site-styles";

// One appearance policy feeds all three resolvers, so they cannot disagree: the server
// renders both root attributes and the matching browser-chrome tint, the pre-paint script
// re-resolves each axis from storage, and the provider adopts whatever was painted.
const initialAppearance = getInitialAppearance();
const initialThemeMetaColor = getAppearanceMetaColor(initialAppearance);
const themeBootstrap = buildThemeBootstrapScript();
const isVisualStyleLocked = !SITE_FLAVOR_CONFIG.showVisualStyleToggle;
const zodJitlessBootstrap = buildZodJitlessBootstrapScript();
// Both faces are registered in both builds so the Fun/Pro choice is a style switch, not a
// reload. `proFont` sets `preload: false`, so a Fun reader downloads none of it.
const rootFontClassName = `${siteFont.variable} ${proFont.variable}`;
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
      data-theme={initialAppearance.colorScheme}
      data-visual-style={initialAppearance.visualStyle}
      suppressHydrationWarning
      className={rootFontClassName}
    >
      <head>
        <meta id={THEME_META_ID} name="theme-color" content={initialThemeMetaColor} />
        {/* Every glyph on the site is fetched from the Iconify API at runtime — nothing is
            bundled (`src/components/common/Icon.tsx:6-10`) — so the first icon on a cold
            visit pays a DNS lookup and a TLS handshake before any pixels. That was cosmetic
            while controls carried text; the appearance panel is now icon-only, so warming
            the socket in <head> is the difference between a late glyph and a late control.
            One host, not three: this is `@iconify/react`'s primary resource, and its two
            redundant APIs are only rotated in when this one stays silent past 750ms, so
            warming all three would leave two sockets nothing opens.
            `connect-src` already lists this exact origin
            (`lib/next/cspObservationPolicy.ts:19-23,135,144`), so no policy changes with
            this. `crossOrigin` is required rather than decorative: the icon request is a
            CORS `fetch`, and an anonymous preconnect is the only one it can reuse. There is
            no font equivalent to add — `next/font` self-hosts both faces, which is why this
            is the layout's first preconnect. */}
        <link rel="preconnect" href="https://api.iconify.design" crossOrigin="anonymous" />
        {/* Raw inline, in <head>, on purpose: `next/script`'s beforeInteractive strategy
            compiles to a body-side queue push, which runs after the head has been parsed
            and so cannot be a *pre*-paint restore. This script is the only thing standing
            between a reader with a saved preference and a frame of the wrong appearance. */}
        <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="app-container theme-page-shell relative">
        <Script id="zod-jitless-bootstrap" strategy="beforeInteractive">
          {zodJitlessBootstrap}
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
        <ThemeProvider
          initialColorScheme={initialAppearance.colorScheme}
          initialVisualStyle={initialAppearance.visualStyle}
          isVisualStyleLocked={isVisualStyleLocked}
        >
          <RouteChrome homeConstructionMode={homeConstructionMode} />
          <div className="app-content relative">
            <div className="flex-1">
              {children}
            </div>
            <RouteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
