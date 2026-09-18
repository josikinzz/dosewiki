// Ambient module declarations for raw text imports via the `?raw` query.
// Markdown content is bundled this way (see next.config.ts `raw-loader` /
// `asset/source` rules) and consumed by the public documentation and content
// loaders. The `vite/client` types referenced by
// the old Vite-era declaration file are already provided globally via
// tsconfig.json `compilerOptions.types`.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
