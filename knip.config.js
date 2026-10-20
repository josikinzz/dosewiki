import { readFileSync } from "node:fs";
import { productionWriterClassifications } from "./scripts/lib/production-writer-inventory.mjs";

const inventoriedScripts = Object.values(productionWriterClassifications)
  .flat()
  .filter((file) => typeof file === "string" && file.startsWith("scripts/"));

const lineageProducers = JSON.parse(readFileSync("data/lineage.json", "utf8"))
  .artifacts.map((artifact) => artifact.producer)
  .filter((producer) => typeof producer === "string" && producer.startsWith("scripts/"));

const allowlistedScripts = [
  "scripts/security/scan-secrets.mjs",
  "scripts/deploy/check-build-command-wiring.mjs",
  "scripts/build/build-surface-cli.mjs",
  "scripts/replications/archive-replication-masters.mjs",
  "scripts/replications/transcode-videos.mjs",
  "scripts/replications/build-local-r2-upload-plan.mjs",
  "scripts/replications/run-local-r2-upload-batches.mjs",
  "scripts/replications/verify-r2-media-copy.mjs",
  "scripts/citations/recover-dropped-sentences.mjs",
  "scripts/tools/pi-citation-workflow/citation-campaign.mjs",
  "scripts/tools/pi-citation-workflow/pi-run-manifest.mjs",
  "scripts/tools/pi-citation-workflow/prepare-local-proposal-run.mjs",
  "scripts/research/collect-psychonautwiki-2015-subjective-effects.mjs",
  "scripts/perf/bundle-size.mjs",
  "scripts/perf/measure.mjs",
  "scripts/legality/inventory-coverage.mjs",
  "scripts/build/generate{Substance,Page,Entity}SocialCards.ts",
  "scripts/data-ops/data-import-substance-index.mjs",
  "scripts/postgres/preload-server-only.ts",
  "scripts/translation/ui-catalog.ts",
  "scripts/translation/live-mirror.ts",
  "scripts/translation/mirror-coverage.ts",
];

const appEntries = [
  "src/**/*.public.tsx",
  "src/app/_fonts/*.ts",
  "src/app/_styles/*.ts",
  "src/styles/pro-theme.css",
  "src/styles/theme-light-mode.css",
  "src/features/theme-lab/themeLabBootstrap.ts",
  "src/components/{common,layout}/index.ts",
];

const config = {
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
        "scripts/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "src/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}",
      ],
      ignore: [
        "scripts/**/*.d.ts",
        "scripts/translation/offline/app.js",
      ],
      ignoreDependencies: [
        "raw-loader",
        "@iconify-json/*",
        "gt-next",
      ],
      ignoreBinaries: ["ffmpeg", "ffprobe", "identify", "python3.13", "rclone", "pg_ctl", "psql"],
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
        config: ["vitest.config.ts", "scripts/test/vitest.workflow.config.ts"],
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
