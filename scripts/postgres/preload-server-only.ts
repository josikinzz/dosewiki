/**
 * Bun preload: `server-only` is a Next-resolved marker module with no package
 * behind it. Scripts that import `lib/data/*` or `lib/postgres/runtime/*`
 * under Bun get a no-op module, the same as vitest's `src/test/server-only.ts`.
 */
// `bun` types are not in tsconfig.scripts.json; the global is present at runtime.
type BunPlugin = { plugin(spec: { name: string; setup(build: { module(name: string, load: () => { contents: string; loader: "js" }): void }): void }): void };
const bun = (globalThis as { Bun?: BunPlugin }).Bun;
if (!bun) throw new Error("preload-server-only.ts runs under Bun only");

bun.plugin({
  name: "server-only-alias",
  setup(build) {
    build.module("server-only", () => ({ contents: "export {};", loader: "js" }));
  },
});
