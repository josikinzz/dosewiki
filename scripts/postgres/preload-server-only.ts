type BunPlugin = { plugin(spec: { name: string; setup(build: { module(name: string, load: () => { contents: string; loader: "js" }): void }): void }): void };
const bun = (globalThis as { Bun?: BunPlugin }).Bun;
if (!bun) throw new Error("preload-server-only.ts runs under Bun only");

bun.plugin({
  name: "server-only-alias",
  setup(build) {
    build.module("server-only", () => ({ contents: "export {};", loader: "js" }));
  },
});
