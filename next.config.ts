import path from "node:path";
import type { NextConfig } from "next";
import { getPublicBrowserRuntimeConfig } from "./lib/runtime/envContract";
// The legacy redirect table lives in its own module so application code (the Discord
// page) can read the invite URL from it without importing this config.
import { effectIndexLegacyRedirects } from "./lib/next/effectIndexLegacyRedirects";
import { substanceRouteAliases } from "./lib/next/substanceRouteAliases";

const publicBrowserConfig = getPublicBrowserRuntimeConfig();

/**
 * Build-time flavor module selection.
 *
 * `next/font` is an SWC compile-time transform: every option value must be a written
 * literal, so the two publications' faces cannot be gated inside one module, and
 * importing both would ship the unused face's `@font-face` blocks and preload links into
 * the flavor that does not render it. Each module exports the same two faces — the
 * publication's own `siteFont` and the Pro style's `proFont` — and differs in what those
 * mean: dose.wiki registers Titillium separately and never preloads it, while Effect
 * Index paints it as its own face and aliases the two names onto one registration.
 * Resolving each `@site-*` alias to exactly one module is the only place that decision can
 * live. The stylesheet alias also keeps each publication's inert, flavor-scoped CSS out of
 * the other publication's critical CSS payload.
 *
 * The flavor normalisation below mirrors `resolveSiteFlavor()` in
 * `src/config/siteFlavor.ts`, which is the source of truth everywhere else. This file
 * cannot import it: the config loader cannot resolve `next/navigation`, which that module
 * pulls in for its route guard. The two flavor builds exercise both branches.
 */
const SITE_FONT_MODULES = {
  dosewiki: "./src/app/_fonts/dosewiki.ts",
  effectindex: "./src/app/_fonts/effectindex.ts",
} as const;

const SITE_STYLE_MODULES = {
  dosewiki: "./src/app/_styles/dosewiki.ts",
  effectindex: "./src/app/_styles/effectindex.ts",
} as const;

const siteFlavor =
  process.env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() === "effectindex"
    ? "effectindex"
    : "dosewiki";
const siteFontModule = SITE_FONT_MODULES[siteFlavor];
const siteStyleModule = SITE_STYLE_MODULES[siteFlavor];

const categoryRouteAliases = {
  psychedelics: "psychedelic",
  dissociatives: "dissociative",
  entactogens: "entactogen",
  stimulants: "stimulant",
  antidepressants: "antidepressant",
  antipsychotics: "antipsychotic",
  opioids: "opioid",
  deliriants: "deliriant",
  hallucinogens: "hallucinogen",
  gabaergics: "gabaergic",
  cannabinoids: "cannabinoid",
} as const;

const effectCategoryRouteAliases = {
  visual: "visual-effects",
  visuals: "visual-effects",
  auditory: "auditory-effects",
  cognitive: "cognitive-effects",
  physical: "physical-effects",
  tactile: "tactile-effects",
  multisensory: "multisensory-effects",
  hallucinatory: "hallucinatory-states",
  "hallucinatory-state": "hallucinatory-states",
  "geometric-pattern": "geometric-patterns",
  "smell-and-taste": "smell-and-taste-effects",
} as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The unlisted /html-docs/[doc] route reads repo-root html-docs/ at request time;
  // without this the files never reach the deployed serverless bundle.
  outputFileTracingIncludes: {
    "/html-docs/[doc]": ["./html-docs/**/*"],
    "/api/og/molecule/[slug]": ["./public/fonts/Blinker-Regular.ttf"],
  },
  // Native N-API package used by the molecule OG-card route; bundling it breaks
  // the per-platform binding resolution, so it must load from node_modules.
  serverExternalPackages: ["@resvg/resvg-js"],
  experimental: {
    optimizePackageImports: [
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@iconify/react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@tanstack/react-query",
      "cmdk",
      "framer-motion",
      "react-hook-form",
    ],
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    localPatterns: [
      // Convex-backed molecule SVGs are cache-busted with a ?v=<updatedAt> query.
      { pathname: "/api/molecules/**" },
      { pathname: "/**", search: "" },
    ],
    // Convex file storage (replication artwork, posters, thumbnails). Derived from
    // the same browser deployment URL the client bundle reads, so AppImage's
    // decision to send a storage URL through the optimizer always agrees with
    // this allowlist (see isConvexStorageImage in src/components/common/AppImage.tsx).
    remotePatterns: publicBrowserConfig.convexUrl
      ? [new URL("/api/storage/**", publicBrowserConfig.convexUrl)]
      : [],
  },
  env: {
    NEXT_PUBLIC_CONVEX_URL: publicBrowserConfig.convexUrl,
  },
  turbopack: {
    resolveAlias: {
      "@site-font": siteFontModule,
      "@site-styles": siteStyleModule,
    },
    rules: {
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/i,
      resourceQuery: /raw/,
      type: "asset/source",
    });

    config.resolve.alias = {
      ...config.resolve.alias,
      "@site-font": path.resolve(process.cwd(), siteFontModule),
      "@site-styles": path.resolve(process.cwd(), siteStyleModule),
    };

    return config;
  },
  async redirects() {
    return [
      {
        source: "/replications/effect/:slug",
        destination: "/effects/:slug",
        permanent: true,
      },
      {
        source: "/replications/substance/:slug",
        destination: "/:slug",
        permanent: true,
      },
      ...Object.entries(substanceRouteAliases).map(([source, destination]) => ({
        source: `/${source}`,
        destination: `/${destination}`,
        permanent: true,
      })),
      ...effectIndexLegacyRedirects.map(({ source, destination }) => ({
        source,
        destination,
        permanent: true,
      })),
      ...Object.entries(categoryRouteAliases).map(([source, destination]) => ({
        source: `/category/${source}`,
        destination: `/category/${destination}`,
        permanent: true,
      })),
      ...Object.entries(effectCategoryRouteAliases).map(
        ([source, destination]) => ({
          source: `/effects/category/${source}`,
          destination: `/effects/category/${destination}`,
          permanent: true,
        }),
      ),
    ];
  },
  async headers() {
    return [
      {
        // The generated chroma sheet lives in public/, which Next otherwise serves with
        // max-age=0 — a paint-blocking revalidation round-trip on every repeat visit. Its
        // href always carries a ?v=<content-hash> cache-buster (CHROMA_STYLESHEET_HREF in
        // src/theme/appearanceChroma.ts), so any change to the sheet changes the URL and
        // the response itself may be cached forever. Path matching ignores the query, so
        // this covers the versioned URL and the bare route alike.
        source: "/appearance-chroma.css",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // The Pro and light-mode appearance sheets moved out of the bundled CSS chain into
        // public/ with the same contract: hrefs always carry ?v=<content-hash>
        // (src/theme/appearanceSheets.ts), so both may be cached forever.
        source: "/pro-theme.css",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/theme-light-mode.css",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
