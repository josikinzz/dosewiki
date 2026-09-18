import { defineConfig } from "vitest/config";
import path from "path";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      "@": path.resolve(repoRoot, "./src"),
      "@data": path.resolve(repoRoot, "./data"),
      "@content": path.resolve(repoRoot, "./content"),
      "@server": path.resolve(repoRoot, "./lib"),
      "server-only": path.resolve(repoRoot, "./src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.{test,spec}.{mjs,ts}"],
    exclude: ["node_modules", "dist", "dist-inline"],
  },
});
