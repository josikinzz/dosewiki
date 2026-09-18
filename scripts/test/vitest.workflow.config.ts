import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["scripts/**/*.{test,spec}.{mjs,js,ts,tsx}"],
    exclude: [
      "node_modules/**",
      "**/node_modules/**",
      "dist/**",
      "dist-inline/**",
      "scripts/deprecated/**",
      "scripts/lib/workflow-command-surface.test.mjs",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "@data": path.resolve(__dirname, "../../data"),
      "@content": path.resolve(__dirname, "../../content"),
      "@auth": path.resolve(__dirname, "../../lib/auth/authOptions.ts"),
      "@server": path.resolve(__dirname, "../../lib"),
      "server-only": path.resolve(__dirname, "../../src/test/server-only.ts"),
    },
  },
});
