import path from "node:path";
import type { NextConfig } from "next";
import {
  EditorArtifactAudit,
  getServerRuntimeIncludes,
} from "./scripts/build/editor-artifact-audit.mjs";
import {
  normalizeSiteFlavor,
  resolveBuildDirectory,
  resolveBuildSurface,
  resolvePrebuiltDeploymentId,
} from "./scripts/build/build-surface.mjs";
import { resolveBuildConcurrency } from "./lib/next/buildConcurrency";
import { effectIndexLegacyRedirects } from "./lib/next/effectIndexLegacyRedirects";
import { substanceRouteAliases } from "./lib/next/substanceRouteAliases";

const buildSurface = resolveBuildSurface();
const editorBuild = buildSurface === "editor";
const buildDirectory = resolveBuildDirectory();
if (
  process.env.NODE_ENV === "production" &&
  process.argv.includes("build") &&
  !process.argv.includes("--webpack")
) {
  throw new Error(
    "Public/editor artifact separation requires the audited webpack build. Use bun run build (next build --webpack).",
  );
}

const SITE_FONT_MODULES = {
  dosewiki: "./src/app/_fonts/dosewiki.ts",
  effectindex: "./src/app/_fonts/effectindex.ts",
} as const;

const SITE_STYLE_MODULES = {
  dosewiki: "./src/app/_styles/dosewiki.ts",
  effectindex: "./src/app/_styles/effectindex.ts",
} as const;

const EDITOR_STYLE_MODULE = "./src/app/_styles/dosewiki-editor.ts";

const siteFlavor = normalizeSiteFlavor(process.env.NEXT_PUBLIC_SITE_FLAVOR);
const siteFontModule = SITE_FONT_MODULES[siteFlavor];
const siteStyleModule =
  editorBuild && siteFlavor === "dosewiki" ? EDITOR_STYLE_MODULE : SITE_STYLE_MODULES[siteFlavor];

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

const prebuiltDeploymentId = resolvePrebuiltDeploymentId();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(prebuiltDeploymentId ? { deploymentId: prebuiltDeploymentId } : {}),
  distDir: buildDirectory,
  productionBrowserSourceMaps: false,
  outputFileTracingIncludes: {
    "/api/cron/translation-refresh": ["./scripts/translation/**/*.json"],
  },
  experimental: {
    ...resolveBuildConcurrency(),
    ...(prebuiltDeploymentId ? { runtimeServerDeploymentId: false } : {}),
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
  staticPageGenerationTimeout: 180,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    localPatterns: [
      { pathname: "/api/molecules/**" },
      { pathname: "/**", search: "" },
    ],
    remotePatterns: [],
    maximumRedirects: 0,
  },
  env: {
    NEXT_PUBLIC_EDITOR_BUILD: String(editorBuild),
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
  webpack(config, { isServer, dev, config: resolvedConfig }) {
    if (!dev && config.cache && config.cache.type === "filesystem") {
      config.cache.version = `${config.cache.version ?? ""}|deploymentId:${resolvedConfig.deploymentId ?? ""}`;
    }
    if (!dev && !editorBuild) {
      config.module.rules.unshift({
        test: /\.[cm]?[jt]sx?$/,
        include: path.resolve(process.cwd(), "src"),
        enforce: "pre",
        use: [
          {
            loader: path.resolve(
              process.cwd(),
              "scripts/build/public-editor-boundary.mjs",
            ),
            options: { client: !isServer },
          },
        ],
      });
    }
    if (!dev && !isServer) {
      config.plugins.push(
        new EditorArtifactAudit({
          editorBuild,
          directory: path.resolve(process.cwd(), buildDirectory),
        }),
      );
    }
    config.module.rules.push({
      test: /\.md$/i,
      resourceQuery: /raw/,
      type: "asset/source",
    });

    for (const plugin of config.resolve.plugins ?? []) {
      if (plugin?.jsConfigPlugin === true && plugin.paths) {
        delete plugin.paths["@site-font"];
        delete plugin.paths["@site-styles"];
      }
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      "@site-font": path.resolve(process.cwd(), siteFontModule),
      "@site-styles": path.resolve(process.cwd(), siteStyleModule),
    };

    return config;
  },
  async rewrites() {
    return [
      {
        source: "/subscribe",
        destination: "/api/subscribe",
      },
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
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
        source: "/appearance-chroma.css",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
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
      {
        source: "/images/social/:collection/:card*.png",
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

export default async function configureNext(): Promise<NextConfig> {
  return {
    ...nextConfig,
    outputFileTracingIncludes: {
      ...nextConfig.outputFileTracingIncludes,
      "/*": await getServerRuntimeIncludes(),
    },
  };
}
