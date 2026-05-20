import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["scripts/**/*.{test,spec}.{mjs,js,ts,tsx}"],
    exclude: [
      "node_modules/**",
      "dist/**",
      "dist-inline/**",
      "scripts/deprecated/**",
      "scripts/lib/workflow-command-surface.test.mjs",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "@auth": path.resolve(__dirname, "../../auth.ts"),
      "@server": path.resolve(__dirname, "../../lib"),
      "server-only": path.resolve(__dirname, "../../src/test/server-only.ts"),
    },
  },
});
