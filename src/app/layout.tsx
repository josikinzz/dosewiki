import type { Metadata } from "next";
import { env } from "node:process";
import Script from "next/script";
import { PUBLIC_SITE, buildSiteAssetUrl, buildSiteUrl } from "@server/next/publicSite";
import { THEME_META_ID, getThemeMetaColor, buildThemeBootstrapScript } from "@/theme";
import { blinker } from "./fonts";
import { RouteChrome, RouteFooter } from "./_components/RouteChrome";
import { PaletteLab } from "@/components/dev/PaletteLab";
// yet-another-react-lightbox vendor CSS (and the plum-theme overrides) are
// imported inside ReplicationLightbox.tsx so they ship in that lazy chunk and
// load only when a gallery lightbox is first opened — not on every page.
import "../styles.css";

const themeBootstrap = buildThemeBootstrapScript();
const homeConstructionMode = env.NEXT_PUBLIC_HOME_CONSTRUCTION_MODE === "true";

// Self-hosted Umami analytics (Railway). The script lives in the shared root
// layout, but `data-domains` makes the tracker record events ONLY when the page
// is served on the public hosts below — so the admin Vercel host and preview
// deploys are never tracked. Auto-extends to the full public site at launch.
const UMAMI_SRC = "https://analytics.dose.wiki/script.js";
const UMAMI_WEBSITE_ID = "8fdefec9-8396-4b36-b822-398e3b9c6816";
const UMAMI_DOMAINS = "dose.wiki,www.dose.wiki";

export const metadata: Metadata = {
  title: "dose.wiki - Substance Information Database",
  description:
    "dose.wiki is a harm reduction database providing dosage, duration, effects, and safety information for psychoactive substances.",
  keywords: [
    "harm reduction",
    "drug information",
    "dosage",
    "psychoactive substances",
    "drug safety",
    "effects",
    "interactions",
  ],
  authors: [{ name: "dose.wiki Contributors" }],
  metadataBase: new URL(PUBLIC_SITE.url),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: PUBLIC_SITE.name,
    title: "dose.wiki - Substance Information Database",
    description:
      "Harm reduction database providing dosage, duration, effects, and safety information for psychoactive substances.",
    url: buildSiteUrl("/"),
    images: [
      {
        url: buildSiteAssetUrl(PUBLIC_SITE.logoPath),
        width: 512,
        height: 512,
        alt: "dose.wiki logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "dose.wiki - Substance Information Database",
    description: "Harm reduction database for psychoactive substances.",
    images: [buildSiteAssetUrl(PUBLIC_SITE.logoPath)],
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={blinker.variable}>
      <head>
        <meta id={THEME_META_ID} name="theme-color" content={getThemeMetaColor("dark")} />
      </head>
      <body className="app-container theme-page-shell relative">
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
        <Script
          src={UMAMI_SRC}
          data-website-id={UMAMI_WEBSITE_ID}
          data-domains={UMAMI_DOMAINS}
          strategy="afterInteractive"
        />
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
