import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@server": path.resolve(__dirname, "./lib"),
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.{test,spec}.{mjs,ts}"],
    exclude: ["node_modules", "dist", "dist-inline"],
  },
});
