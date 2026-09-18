#!/usr/bin/env bun
/**
 * Emit the offline icon bundle: every Iconify icon name that appears as a
 * string literal in `src/**` or `lib/**` gets its icon data extracted from the
 * matching `@iconify-json/<prefix>` devDependency and written to
 * `src/components/common/iconData.generated.json`. `Icon.tsx` registers that
 * data at module scope, so the glyphs render during SSR and first paint with
 * zero requests to api.iconify.design — the runtime fetch only remains for
 * names outside this bundle (editor-authored Postgres strings, /dev pickers).
 *
 * Scanned sources: `{src,lib}/**\/*.{ts,tsx}` minus generated files and
 * `*.test.*`, plus the manual index layouts (`data/substances/*IndexManual.json`), which
 * carry `iconKey` values that `getCategoryIcon` passes through verbatim when
 * they contain a `:`. The non-runtime component kit under `src/dev` is assigned
 * to the editor catalog, so story/demo glyphs never inflate a public build.
 *
 * A literal only counts as an icon when its prefix resolves to an installed
 * `@iconify-json/<prefix>` package. Prefixes in `NON_ICON_PREFIXES` are known
 * non-icon string shapes (Tailwind variants, repo id schemes) and are skipped
 * silently; anything else unresolved is printed as a warning so a newly
 * adopted collection is a visible `bun add -d @iconify-json/<prefix>` away
 * from being bundled instead of silently falling back to the network. Names
 * missing from their collection are also warnings, not failures — they keep
 * the runtime-fetch behaviour they had before this bundle existed.
 *
 *   npm run generate:icon-data            write the bundle
 *   npm run generate:icon-data -- --check  fail if it is stale
 *
 * `Icon.test.tsx` renders straight from the emitted bundle in the suite.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { getIcons } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";
import { isEditorOnly } from "./public-editor-boundary.mjs";

export const ICON_DATA_PATH = "src/components/common/iconData.generated.json";

/** Extra non-TS sources whose icon strings reach public pages verbatim. */
const EXTRA_SOURCES = [
  "data/substances/chemicalIndexManual.json",
  "data/substances/psychoactiveIndexManual.json",
];

/**
 * `prefix:name`-shaped strings that are not Iconify names. Tailwind variant
 * classes, the repo's own id schemes, and Node built-in specifiers all match
 * the literal regex; listing them here keeps the "unclassified prefix" report
 * meaningful. `custom:` is the local `customIcons` registry in `Icon.tsx`.
 */
const NON_ICON_PREFIXES: Record<string, true> = {
  custom: true,
  // Tailwind variants seen inside class strings.
  sm: true,
  md: true,
  lg: true,
  xl: true,
  hover: true,
  "focus-visible": true,
  disabled: true,
  before: true,
  after: true,
  "motion-reduce": true,
  // Node built-in specifiers and web scheme prefixes.
  node: true,
  blob: true,
  // Repo id/key schemes (search suggestion ids, claim keys, cache tags, …)
  // and misc string shapes (SVG style fragments, `m:ss` duration notes).
  slug: true,
  effect: true,
  substance: true,
  super: true,
  category: true,
  dosewiki: true,
  pmid: true,
  portal: true,
  m: true,
  id: true,
  summary: true,
  history: true,
  legality: true,
  pharmacology: true,
  replication: true,
  report: true,
  submission: true,
  collection: true,
  "data-public": true,
  sha256: true,
  stroke: true,
  "stroke-linecap": true,
  "stroke-linejoin": true,
  display: true,
  "font-size": true,
};

const LITERAL_PATTERN =
  /["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)["'`]/g;

const require = createRequire(import.meta.url);

function* walkSources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSources(path);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !entry.name.includes(".generated.") &&
      !entry.name.includes(".test.")
    ) {
      yield path;
    }
  }
}

// ---- Scan ------------------------------------------------------------------

const publicNames = new Map<string, Set<string>>();
const editorNames = new Map<string, Set<string>>();
let literalCount = 0;

for (const path of [
  ...walkSources(resolve(cwd(), "src")),
  ...walkSources(resolve(cwd(), "lib")),
  ...EXTRA_SOURCES,
]) {
  const editorOnly =
    isEditorOnly(path) || /\/src\/(?:app\/(?:dev|review)|dev)\//.test(path);
  const target = editorOnly ? editorNames : publicNames;
  const text = readFileSync(resolve(cwd(), path), "utf8");
  for (const match of text.matchAll(LITERAL_PATTERN)) {
    const [, prefix, name] = match;
    if (NON_ICON_PREFIXES[prefix]) continue;
    literalCount += 1;
    let names = target.get(prefix);
    if (!names) target.set(prefix, (names = new Set()));
    names.add(name);
  }
}

// An editor literal is private data only when no public source also requires it.
for (const [prefix, names] of editorNames) {
  for (const name of publicNames.get(prefix) ?? []) names.delete(name);
}

let stale = false;
for (const [outputPath, namesByPrefix] of [
  [ICON_DATA_PATH, publicNames],
  ["src/components/common/iconData.editor.generated.json", editorNames],
] as const) {
  // ---- Resolve ---------------------------------------------------------------

  const collections: IconifyJSON[] = [];
  const unresolvable: string[] = [];
  const unclassified: string[] = [];
  let iconCount = 0;

  for (const prefix of [...namesByPrefix.keys()].sort()) {
    const names = [...(namesByPrefix.get(prefix) as Set<string>)].sort();
    let iconSet: IconifyJSON;
    try {
      iconSet = JSON.parse(
        readFileSync(
          require.resolve(`@iconify-json/${prefix}/icons.json`),
          "utf8",
        ),
      ) as IconifyJSON;
    } catch {
      unclassified.push(
        `${prefix} (${names.length} names: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""})`,
      );
      continue;
    }
    const subset = getIcons(iconSet, names, true);
    if (!subset) continue;
    if (subset.not_found?.length) {
      unresolvable.push(...subset.not_found.map((name) => `${prefix}:${name}`));
      delete subset.not_found;
    }
    // Timestamp metadata churns on collection updates without changing content.
    delete subset.lastModified;
    iconCount +=
      Object.keys(subset.icons).length +
      Object.keys(subset.aliases ?? {}).length;
    collections.push(subset);
  }

  const bundle = `${JSON.stringify({ iconCount, collections })}\n`;

  // ---- Report ----------------------------------------------------------------

  stdout.write(
    `${outputPath}: scanned ${literalCount} icon literals; ${iconCount} unique icons across ${collections.length} collections (${bundle.length.toLocaleString()} bytes).\n`,
  );
  for (const line of unclassified) {
    stderr.write(
      `No @iconify-json package installed for prefix: ${line}. Either \`bun add -d @iconify-json/<prefix>\` or add it to NON_ICON_PREFIXES.\n`,
    );
  }
  for (const name of unresolvable) {
    stderr.write(
      `Not found in its collection (will fall back to runtime fetch): ${name}\n`,
    );
  }

  // ---- Write / check ---------------------------------------------------------

  const checkOnly = argv.includes("--check");
  let current: string | null = null;
  try {
    current = readFileSync(resolve(cwd(), outputPath), "utf8");
  } catch {
    current = null;
  }

  if (current === bundle) {
    stdout.write(`${outputPath} is up to date.\n`);
    continue;
  }
  if (checkOnly) {
    stderr.write(`${outputPath} is stale. Run: npm run generate:icon-data\n`);
    stale = true;
    continue;
  }
  writeFileSync(resolve(cwd(), outputPath), bundle, "utf8");
  stdout.write(`Wrote ${outputPath}.\n`);
}
exit(stale ? 1 : 0);
