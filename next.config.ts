import path from "node:path";
import type { NextConfig } from "next";
import {
  EditorArtifactAudit,
  getServerRuntimeIncludes,
} from "./scripts/build/editor-artifact-audit.mjs";
// The legacy redirect table lives in its own module so application code (the Discord
// page) can read the invite URL from it without importing this config.
import { effectIndexLegacyRedirects } from "./lib/next/effectIndexLegacyRedirects";
import { substanceRouteAliases } from "./lib/next/substanceRouteAliases";

// Separate artifacts, never a host-conditional lazy import inside one public bundle.
const buildSurface =
  process.env.DOSEWIKI_BUILD_SURFACE ??
  (process.env.NODE_ENV === "development" ? "editor" : "public");
if (buildSurface !== "public" && buildSurface !== "editor") {
  throw new Error("DOSEWIKI_BUILD_SURFACE must be public or editor.");
}
const editorBuild = buildSurface === "editor";
// `DOSEWIKI_BUILD_DIR` exists so a flavor or surface artifact can be built side by side without clobbering the directory a running server is serving; unset keeps the deployed paths byte-identical.
const buildDirectory =
  process.env.DOSEWIKI_BUILD_DIR ?? (editorBuild ? ".next-editor" : ".next");
if (
  process.env.NODE_ENV === "production" &&
  process.argv.includes("build") &&
  !process.argv.includes("--webpack")
) {
  throw new Error(
    "Public/editor artifact separation requires the audited webpack build. Use bun run build (next build --webpack).",
  );
}

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

// The editor surface layers the dev tool chrome over the dose.wiki entry; see the module.
const EDITOR_STYLE_MODULE = "./src/app/_styles/dosewiki-editor.ts";

const siteFlavor =
  process.env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() === "effectindex"
    ? "effectindex"
    : "dosewiki";
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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: buildDirectory,
  productionBrowserSourceMaps: false,
  // The translation cron reads the Traditional charset beside
  // scripts/translation at request time; the glossary snapshots under
  // data/i18n/glossary are review exports and are never read at runtime.
  outputFileTracingIncludes: {
    "/api/cron/translation-refresh": ["./scripts/translation/**/*.json"],
  },
  experimental: {
    // Static generation reads a multi-megabyte substance library once per
    // worker, and /[slug] prerenders every publicly reachable substance
    // (lib/next/staticParams.ts). Each worker renders its share against that
    // in-process library cache. Letting Next use every host CPU creates a
    // cold-start thundering herd against Postgres; four long-lived workers finish the
    // build more reliably and amortise the corpus read across many pages.
    cpus: 4,
    // Each page fans out server reads against a four-connection pool.
    // One page per worker bounds producer pressure without extending deadlines.
    staticGenerationMaxConcurrency: 1,
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
  // A cold worker's first substance-library render includes the bounded Postgres
  // corpus read and derivation. Give that deliberate cold start room to finish
  // instead of retrying it twice at the default 60-second threshold. The
  // prerendered substance articles hit this path first: whichever article a
  // worker picks up first pays the cold start, every later one is warm.
  staticPageGenerationTimeout: 180,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    localPatterns: [
      // Molecule SVGs are cache-busted with a ?v=<updatedAt> query.
      { pathname: "/api/molecules/**" },
      { pathname: "/**", search: "" },
    ],
    // Managed media uses Worker renditions directly. Neither managed nor legacy
    // R2 origins may enter the optimizer's independently cached delivery path.
    remotePatterns: [],
    // A trusted image URL must never redirect the optimizer to another host.
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
    // next/font embeds deploymentId in CSS font URLs, but Next 16's filesystem
    // cache version omits it. Reusing that CSS after a deploy makes its URL differ
    // from the new HTML preload, downloading the same font twice.
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

    // tsconfig.json also declares `@site-font` / `@site-styles` paths so the type checker
    // resolves them, and those point at the dose.wiki modules. Next feeds tsconfig paths
    // to webpack through JsConfigPathsPlugin, which resolves the same `described-resolve`
    // hook as `resolve.alias` and won: every webpack build, whatever the flavor, bundled
    // dose.wiki's fonts and sheets, and effectindex.com shipped dose.wiki's plum over
    // its own teal. Turbopack honours `resolveAlias` first, which is why `next dev` never
    // showed it. Strip the two keys from the plugin so the alias is the only resolver.
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
      // Preserve the public mailing-list entry path used by external consumers.
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
      {
        // Filenames carry a digest of their page/data, artwork, and renderer inputs.
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
