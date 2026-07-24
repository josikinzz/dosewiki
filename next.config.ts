import type { NextConfig } from "next";
import { getPublicBrowserRuntimeConfig } from "./lib/runtime/envContract";

const publicBrowserConfig = getPublicBrowserRuntimeConfig();

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

    return config;
  },
  async redirects() {
    return [
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
