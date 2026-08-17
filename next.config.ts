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
 * importing both would ship the unused face's `@font-face` blocks and preload links (and,
 * for Titillium, a `next/font/google` fetch) into the flavor that does not render it.
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
  },
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
      ...Object.entries(effectCategoryRouteAliases).map(([source, destination]) => ({
        source: `/effects/category/${source}`,
        destination: `/effects/category/${destination}`,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
