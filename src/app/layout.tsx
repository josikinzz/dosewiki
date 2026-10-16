import type { Metadata } from "next";
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

const initialAppearance = getInitialAppearance();
const initialThemeMetaColor = getAppearanceMetaColor(initialAppearance);
const themeBootstrap = buildThemeBootstrapScript();
const rendersChromaStylesheet =
  SITE_FLAVOR_CONFIG.showSurfacePicker || SITE_FLAVOR_CONFIG.showAccentPicker;
const zodJitlessBootstrap = buildZodJitlessBootstrapScript();
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
        {rendersChromaStylesheet ? (
          <link id={CHROMA_STYLESHEET_LINK_ID} rel="stylesheet" href={CHROMA_STYLESHEET_HREF} />
        ) : null}
        <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script id="zod-jitless-bootstrap" dangerouslySetInnerHTML={{ __html: zodJitlessBootstrap }} />
        {SITE_FLAVOR === "dosewiki" ? (
          <script id="theme-lab-bootstrap" dangerouslySetInnerHTML={{ __html: themeLabBootstrap.script }} />
        ) : null}
      </head>
      <body className="app-container theme-page-shell relative">
        <DocumentRuntime>{children}</DocumentRuntime>
      </body>
    </html>
  );
}
