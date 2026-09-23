import { readFileSync } from "node:fs";
import { productionWriterClassifications } from "./scripts/lib/production-writer-inventory.mjs";

// Script entries. Knip already treats every script a package.json command runs
// as an entry. A script outside package.json is live only when one of these
// registries names it; anything else is dead weight to delete (git history
// keeps it).

// Operator commands in the production writer inventory.
const inventoriedScripts = Object.values(productionWriterClassifications)
  .flat()
  .filter((file) => typeof file === "string" && file.startsWith("scripts/"));

// Producers that data/lineage.json names for generated artifacts.
const lineageProducers = JSON.parse(readFileSync("data/lineage.json", "utf8"))
  .artifacts.map((artifact) => artifact.producer)
  .filter((producer) => typeof producer === "string" && producer.startsWith("scripts/"));

// Scripts that a workflow, hook, runbook, or test runs directly.
const allowlistedScripts = [
  "scripts/security/scan-secrets.mjs", // CI and the pre-commit hook
  "scripts/deploy/check-build-command-wiring.mjs", // CI
  "scripts/build/build-surface-cli.mjs", // remote-build.yml and vercel-policy-checks.yml
  "scripts/replications/archive-replication-masters.mjs", // docs/operations/replication-media-delivery.md
  "scripts/replications/transcode-videos.mjs", // docs/operations/replication-media-delivery.md
  "scripts/replications/build-local-r2-upload-plan.mjs", // tested local R2 upload tooling
  "scripts/replications/run-local-r2-upload-batches.mjs",
  "scripts/replications/verify-r2-media-copy.mjs",
  "scripts/citations/recover-dropped-sentences.mjs", // tested citation repair tool
  "scripts/tools/pi-citation-workflow/citation-campaign.mjs", // docs/workflows/citations.md
  "scripts/tools/pi-citation-workflow/pi-run-manifest.mjs",
  "scripts/tools/pi-citation-workflow/prepare-local-proposal-run.mjs",
  "scripts/research/collect-psychonautwiki-2015-subjective-effects.mjs", // content/README.md
  "scripts/perf/*.mjs", // manual performance probes
  "scripts/legality/inventory-coverage.mjs", // read-only legality campaign inventory, run by hand
  "scripts/build/generate{Substance,Page,Entity}SocialCards.ts", // spawned by generateSocialCards.mjs
  "scripts/data-ops/data-import-substance-index.mjs", // lineage consumer of the substance index export
  "scripts/postgres/preload-server-only.ts", // bun --preload in package.json commands
  "scripts/translation/ui-catalog.ts", // docs/operations/locale-mirrors.md
  "scripts/translation/live-mirror.ts",
  "scripts/translation/mirror-coverage.ts",
  "scripts/util/recolorMolecules.mjs", // src/data/mappings/moleculePalette.ts
];

// App files reached without a static import.
const appEntries = [
  "src/**/*.public.tsx", // swapped in for *.editor.tsx by scripts/build/public-editor-boundary.mjs
  "src/app/_fonts/*.ts", // per-flavor @site-font alias in next.config.ts
  "src/app/_styles/*.ts", // per-flavor @site-styles alias in next.config.ts
  "src/styles/pro-theme.css", // copied to public/ by generateAppearanceSheets.ts
  "src/styles/theme-light-mode.css",
  "src/features/theme-lab/themeLabBootstrap.ts", // compiled by generateThemeLabBootstrap.ts
  "src/features/effects/effectGuideClass.ts", // named by data/lineage.json
];

/** @type {import("knip").KnipConfig} */
const config = {
  // Dead files, dependencies, and binaries fail the check. Unused exports are
  // reported for cleanup but do not fail it.
  rules: {
    exports: "warn",
    types: "warn",
    duplicates: "warn",
  },
  workspaces: {
    ".": {
      entry: [...inventoriedScripts, ...lineageProducers, ...allowlistedScripts, ...appEntries],
      project: [
        "src/middleware.ts",
        "*.config.{js,mjs,cjs,ts,mts,cts}",
        "server/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "lib/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "runs/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "scripts/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "!scripts/deprecated/**",
        "src/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}",
      ],
      ignore: [
        "scripts/**/*.d.ts", // type sidecars for .mjs modules
        "scripts/translation/offline/app.js", // browser asset copied into the offline pack
      ],
      ignoreDependencies: [
        "raw-loader",
        "@iconify-json/*", // generateIconData.ts resolves icon sets by collection name
        "gt-next", // deferred on purpose: docs/operations/locale-mirrors.md
      ],
      ignoreBinaries: ["ffmpeg", "ffprobe", "identify", "python3.13", "rclone", "pg_ctl", "psql"],
      // Bun and Vitest execute this TypeScript CLI import; Knip cannot resolve it from the ESM test.
      ignoreUnresolved: ["scripts/legality/validate-draft.ts"],
      next: {
        config: "next.config.ts",
      },
      postcss: {
        config: "postcss.config.cjs",
      },
      tailwind: {
        entry: "tailwind.config.mjs",
      },
      vitest: {
        config: ["vitest.config.ts", "scripts/config/vitest.scripts.config.ts", "scripts/test/vitest.workflow.config.ts"],
        entry: [
          "src/**/*.{test,spec}.{ts,tsx}",
          "lib/**/*.{test,spec}.{ts,tsx}",
          "scripts/**/*.{test,spec}.{js,mjs,cjs,ts,tsx}",
        ],
      },
    },
    "vendor/openchemlib": {
      entry: [
        "dist/openchemlib.{js,d.ts}",
        "dist/openchemlib.debug.js",
        "lib/index.{js,d.ts}",
        "lib/index.debug.{js,d.ts}",
        "scripts/{build,build_help,build_resources,clean,create_24px_cursors,stringWidthDataGenerator}.js",
        "scripts/openchemlib/{classes,generate_image_data,removed}.js",
      ],
      project: [
        "dist/**/*.{js,d.ts}",
        "lib/**/*.{js,d.ts}",
        "scripts/**/*.js",
        "src/**/*.{java,js,ts,d.ts,css}",
        "tests/**/*.{js,ts}",
        "*.config.{js,mjs,cjs,ts,mts,cts}",
      ],
      // The fork keeps upstream files and dev tooling it does not run.
      ignore: ["lib/canvas_editor/cursor_manager_16.js", "src/resources/html/styles.css"],
      ignoreDependencies: ["benchmark", "openchemlib-utils", "postcss", "tailwindcss"],
      ignoreBinaries: ["java"],
      vite: {
        config: "vite.config.ts",
      },
      vitest: {
        config: "vitest.config.ts",
        entry: "tests/**/*.{test,spec}.{js,ts}",
      },
    },
  },
};

export default config;
