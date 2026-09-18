import { extname } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const scriptExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"]);
const excludedScriptDirectories = new Set(["scripts/deprecated"]);

const collectExecutableScripts = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (excludedScriptDirectories.has(path) || entry.name === "archive") return [];
      return collectExecutableScripts(path);
    }
    if (!scriptExtensions.has(extname(entry.name))) return [];
    return readFileSync(path, "utf8").startsWith("#!") ? [path] : [];
  });

const executableScripts = collectExecutableScripts("scripts");

/** @type {import("knip").KnipConfig} */
const config = {
  workspaces: {
    ".": {
      entry: [
        ...executableScripts,
        "scripts/tools/pi-citation-workflow/citation-campaign.mjs",
        "scripts/perf/*.mjs",
      ],
      project: [
        "src/middleware.ts",
        "*.config.{js,mjs,cjs,ts,mts,cts}",
        "server/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "lib/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "runs/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "scripts/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
        "src/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css}",
      ],
      ignoreDependencies: ["raw-loader"],
      ignoreBinaries: ["ffmpeg", "ffprobe", "identify", "python3.13"],
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
