#!/usr/bin/env bun
/**
 * Single-file offline edition of the zh-Hans corpus.
 *
 * Emits one self-contained HTML file: the FreeODwiki-shaped Markdown tree
 * (every substance, effect, effect category, report, article, and summary),
 * the index metadata a reader needs to browse it, the dark-colourway molecule
 * drawings, the site's own icons and logo, and a small vanilla-JS reader.
 * No network is needed to read it; the downloads page links back to the
 * published packs on dose.wiki and can also save the embedded JSON.
 *
 * The data rides as one gzipped, base64-encoded JSON blob inflated in the
 * browser with DecompressionStream, so the file stays a few megabytes.
 *
 *   bun scripts/translation/build-offline.mjs [--out <file>]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

import { getCategoryIcon } from "../../src/data/config/categoryIcons.ts";
import psychoactiveManual from "../../data/substances/psychoactiveIndexManual.json";
import chemicalManual from "../../data/substances/chemicalIndexManual.json";
import iconData from "../../src/components/common/iconData.generated.json";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.join(repoRoot, "notes-and-plans/exports/translation/zh-Hans");
const TREE = path.join(ROOT, "freeodwiki");
const OUT_DEFAULT = path.join(repoRoot, "public/downloads/zh-Hans/dose.wiki.zh-Hans.html");
const SITE = "https://dose.wiki";

/** Corpus directory names in the Chinese tree, and the reader routes each maps to. */
const CORPUS_ROUTE = {
  substances: "substances",
  effects: "effects",
  effectCategories: "effects/category",
  reports: "reports",
  articles: "library",
  summaries: "library",
};

const HOME_TILES = [
  { route: "substances", icon: "streamline-ultimate:science-molecule-strucutre-bold" },
  { route: "effects", icon: "material-symbols:person-play-outline-rounded" },
  { route: "reports", icon: "hugeicons:content-writing" },
  { route: "library", icon: "lucide:book-open-text" },
  { route: "downloads", icon: "charm:download" },
];

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
}

/**
 * Hard-wrap the payload at 32 characters. `atob` ignores the newlines, and no
 * unbroken run is long enough to look like an API key, so the repository's
 * secret scanner cannot false-positive on compressed bytes. Costs ~3% of the
 * uncompressed file and nothing over the wire.
 */
function wrapBase64(text) {
  return text.replace(/.{32}/g, "$&\n");
}

function firstSentence(text) {
  const plain = String(text ?? "")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/<https?:[^>]*>|https?:\/\/\S+/g, "")
    .replace(/\*\*|\*|\[cite:[^\]]*\]|\[citation-needed\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const match = plain.match(/^.*?[。.!?！？](?=\s|$)/);
  return (match ? match[0] : plain).trim();
}

/** Rewrite tree-relative Markdown links to reader routes; leave the web alone. */
function rewriteLinks(markdown, routeByPath, ownDir, indexRoute) {
  return markdown.replace(/\]\(([^)\s]+?\.md)(#[^)]*)?\)/g, (whole, target, hash) => {
    const clean = target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join(ownDir, target));
    if (target === "index.md") return `](#/${indexRoute})`;
    const route = routeByPath.get(decodeURIComponent(clean));
    if (!route) return whole;
    return `](#/${route}${hash ?? ""})`;
  });
}

function stripFrontMatter(markdown) {
  return markdown.startsWith("---\n") ? markdown.replace(/^---\n[\s\S]*?\n---\n\n?/, "") : markdown;
}

/** The site's hand-drawn icons live as static TSX in customIcons.tsx; lift their SVG bodies verbatim. */
let customIcons = null;
async function loadCustomIcons() {
  const source = await readFile(path.join(repoRoot, "src/components/common/customIcons.tsx"), "utf8");
  customIcons = {};
  for (const match of source.matchAll(/^\s{2}(\w+): \(props\) => \(\s*<svg([^>]*)>([\s\S]*?)<\/svg>/gm)) {
    const viewBox = match[2].match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
    const [, , w, h] = viewBox.split(/\s+/).map(Number);
    customIcons[match[1]] = { body: match[3].replace(/\{\.\.\.props\}/g, "").trim(), w, h };
  }
}

function resolveIcon(name, used) {
  const [prefix, ...rest] = name.split(":");
  const iconName = rest.join(":");
  if (prefix === "custom") {
    if (!customIcons?.[iconName]) throw new Error(`Custom icon ${name} not found in customIcons.tsx`);
    used[name] = customIcons[iconName];
    return name;
  }
  const collection = iconData.collections.find((entry) => entry.prefix === prefix);
  const icon = collection?.icons[iconName] ?? (collection?.aliases?.[iconName] ? collection.icons[collection.aliases[iconName].parent] : null);
  if (!icon) throw new Error(`Icon ${name} is not in the bundled icon data`);
  used[name] = { body: icon.body, w: icon.width ?? collection.width ?? 16, h: icon.height ?? collection.height ?? 16 };
  return name;
}

const TONE_ORDER = ["danger", "unsafe", "caution"];

async function main() {
  const outArg = process.argv.indexOf("--out");
  const outPath = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : OUT_DEFAULT;

  await loadCustomIcons();
  const [report, substances, effects, categories, reports, articles, summaries, layout, copy, bannerPresets, manifest] = await Promise.all([
    readJson("freeodwiki/export-report.json"),
    readJson("substances/SubstanceIndex.zh-Hans.json"),
    readJson("effects/EffectIndex.zh-Hans.json"),
    readJson("effectCategories/EffectCategories.zh-Hans.json"),
    readJson("reports/TripReports.zh-Hans.json"),
    readJson("articles/Articles.zh-Hans.json"),
    readJson("summaries/PsychoactiveSummaries.zh-Hans.json"),
    readJson("layout/Layout.zh-Hans.json"),
    readJson("copy/CopyBlocks.zh-Hans.json"),
    readJson("banners/WarningBanners.zh-Hans.json"),
    JSON.parse(await readFile(path.join(repoRoot, "public/downloads/zh-Hans/manifest.json"), "utf8")),
  ]);

  // Routes: every page in the tree gets `#/<corpus-route>/<slug>`.
  const routeByPath = new Map();
  const pageByRoute = new Map();
  for (const page of report.pages) {
    const base = CORPUS_ROUTE[page.corpus];
    if (!base) throw new Error(`No route for corpus ${page.corpus}`);
    const route = `${base}/${page.slug}`;
    routeByPath.set(page.path, route);
    pageByRoute.set(route, page);
  }
  const indexRouteOf = (corpus) => (corpus === "effectCategories" ? "effects" : CORPUS_ROUTE[corpus]);

  const pages = {};
  for (const page of report.pages) {
    const raw = await readFile(path.join(TREE, page.path), "utf8");
    const route = routeByPath.get(page.path);
    // The reader draws its own back link, so the tree's `[◀返回](index.md)` line goes.
    const body = stripFrontMatter(raw).replace(/^\[◀[^\]]*\]\(index\.md\)\n\n?/m, "");
    pages[route] = rewriteLinks(body, routeByPath, path.posix.dirname(page.path), indexRouteOf(page.corpus));
  }

  const icons = {};
  const layoutBy = (kind) => layout.items.filter((item) => item.kind === kind);
  const psychoactiveLabels = new Map(layoutBy("psychoactive-category").map((item) => [item.key, item]));
  const chemicalLabels = new Map(layoutBy("chemical-class").map((item) => [item.machine.classKey, item]));

  const enums = {};
  for (const item of layoutBy("enum-value")) (enums[item.machine.enum] ??= {})[item.machine.value] = item.label;
  const sections = layoutBy("section")
    .filter((item) => item.machine.publicVisible)
    .map((item) => ({ id: item.machine.id, label: item.label, icon: resolveIcon(item.machine.icon, icons), toc: item.machine.toc }));

  const range = (value) => (value && typeof value === "object" && (value.min != null || value.max != null) ? { min: value.min, max: value.max, unit: value.unit ?? "" } : null);
  const substanceIndex = substances.items.map((item) => ({
    slug: item.slug,
    title: item.title,
    summary: firstSentence(item.summary),
    pc: item.classification?.psychoactive_class ?? [],
    cc: item.classification?.chemical_class ?? [],
    aliases: item.identification?.alternative_names ?? [],
    iupac: item.identification?.iupac_name ?? "",
    // Structured hero data: the reader draws the site's tiered dosage and duration panels from these.
    dosage: (item.dosage?.routes ?? []).map((route) => ({
      route: route.route,
      tiers: Object.fromEntries(Object.entries(route.dose_ranges ?? {}).map(([tier, value]) => [tier, range(value)]).filter(([, value]) => value)),
      notes: route.notes ?? "",
      bioavailability: route.bioavailability ?? "",
    })).filter((route) => Object.keys(route.tiers).length > 0),
    duration: (item.duration?.routes ?? []).map((route) => ({
      route: route.route,
      stages: Object.fromEntries(Object.entries(route.stages ?? {}).map(([stage, value]) => [stage, range(value)]).filter(([, value]) => value)),
      halfLife: route.half_life ?? "",
    })).filter((route) => Object.keys(route.stages).length > 0),
  }));
  const substanceSlugs = new Set(substanceIndex.map((entry) => entry.slug));

  const psychoactive = psychoactiveManual.categories.map((category) => {
    const key = `category:psychoactive:${category.key}`;
    const label = psychoactiveLabels.get(key);
    return {
      key: category.key,
      label: label?.label ?? category.label,
      description: label?.description ?? category.definition,
      warning: category.warning ?? "",
      icon: resolveIcon(getCategoryIcon(category.iconKey ?? category.key), icons),
      sections: (category.sections ?? []).map((section) => ({
        key: section.key,
        label: psychoactiveLabels.get(`${key}:section:${section.key}`)?.label ?? section.label,
        drugs: (section.drugs ?? []).filter((slug) => substanceSlugs.has(slug)),
      })),
    };
  });

  const aliasToClass = new Map();
  for (const cls of chemicalManual.classes) {
    for (const alias of [cls.label, ...(cls.aliases ?? [])]) aliasToClass.set(alias.toLowerCase(), cls.key);
  }
  const chemicalMembers = new Map();
  for (const entry of substanceIndex) {
    for (const name of entry.cc) {
      const key = aliasToClass.get(String(name).toLowerCase());
      if (!key) continue;
      if (!chemicalMembers.has(key)) chemicalMembers.set(key, []);
      if (!chemicalMembers.get(key).includes(entry.slug)) chemicalMembers.get(key).push(entry.slug);
    }
  }
  const chemical = chemicalManual.classes
    .map((cls) => ({
      key: cls.key,
      label: chemicalLabels.get(cls.key)?.label ?? cls.label,
      description: firstSentence(chemicalLabels.get(cls.key)?.description ?? cls.description),
      icon: resolveIcon(cls.iconKey ?? "lucide:hexagon", icons),
      members: chemicalMembers.get(cls.key) ?? [],
    }))
    .filter((cls) => cls.members.length > 0);

  const effectIndex = effects.items.map((item) => ({
    slug: item.slug,
    name: item.name,
    summary: firstSentence(item.summary),
    tags: item.tags ?? [],
  }));
  const effectCategories = categories.items.map((item) => ({
    slug: item.slug,
    name: item.name,
    description: item.description,
    icon: resolveIcon(item.icon, icons),
    effects: item.effectSlugs,
  }));

  const reportIndex = reports.items.map((item) => ({
    slug: item.slug,
    title: item.title,
    substances: (item.substances ?? []).map((entry) => entry?.name).filter(Boolean),
    date: item.published_at ? String(item.published_at).slice(0, 10) : "",
  }));

  const library = [
    ...summaries.items.map((item) => ({ slug: item.slug, title: item.title, blurb: firstSentence(item.metadataDescription), group: "summaries" })),
    ...articles.items.map((item) => ({ slug: item.slug, title: item.title, blurb: firstSentence(pages[`library/${item.slug}`]?.split("\n\n")[2] ?? ""), group: "articles" })),
  ].filter((entry) => pageByRoute.has(`library/${entry.slug}`));

  // Molecule drawings: the dark colourway, keyed by substance slug.
  const zip = unzipSync(new Uint8Array(await readFile(path.join(repoRoot, "public/dosewiki-molecules.zip"))));
  const molecules = {};
  const decoder = new TextDecoder();
  for (const [name, bytes] of Object.entries(zip)) {
    const match = name.match(/^molecules-dark\/([^/]+)\.svg$/);
    if (match && substanceSlugs.has(match[1])) molecules[match[1]] = decoder.decode(bytes);
  }

  for (const tile of HOME_TILES) resolveIcon(tile.icon, icons);
  for (const name of ["lucide:book-open", "lucide:tags", "lucide:brain-cog", "lucide:chart-column-increasing", "lucide:chart-line", "lucide:info", "lucide:hand", "lucide:eye", "lucide:ear", "lucide:list", "lucide:chevron-down", "lucide:message-square-quote", "lucide:octagon-alert", "lucide:file-text", "lucide:search", "lucide:arrow-left", "lucide:external-link", "lucide:chevron-right", "lucide:menu", "lucide:x", "lucide:hexagon", "lucide:layers"]) resolveIcon(name, icons);

  const copyOf = (key) => copy.items.find((block) => block.key === key)?.body ?? "";
  const downloads = manifest.datasets.map((dataset) => ({
    id: dataset.id,
    title: dataset.titleZh,
    summary: dataset.summaryZh,
    files: [
      ...Object.entries(dataset.packs ?? {}).map(([lang, file]) => ({ label: lang === "zh-Hans" ? "JSON · 简体中文" : "JSON · English", href: `${SITE}${file.href ?? `/downloads/zh-Hans/${file.file}`}`, bytes: file.bytes })),
      ...Object.entries(dataset.markdown ?? {}).map(([lang, file]) => ({ label: lang === "zh-Hans" ? "Markdown · 简体中文" : "Markdown · English", href: `${SITE}/downloads/zh-Hans/${file.file}`, bytes: file.bytes })),
    ],
  }));

  const bundle = {
    generatedAt: new Date().toISOString().slice(0, 10),
    site: SITE,
    tagline: copyOf("home-hero-tagline"),
    intro: {
      substances: copyOf("substances-index-intro"),
      effects: copyOf("effects-index-intro-lead"),
      reports: copyOf("reports-index-intro"),
      library: copyOf("effects-index-tab-library"),
    },
    tiles: HOME_TILES,
    /**
     * Same render rule as the site: a preset applies to a named slug, never to
     * a classification. Sorted by tone then key, exactly as
     * `compareWarningBanners` in src/data/substanceWarningBanners.ts does; the
     * reader applies the same two-banner cap per article.
     */
    banners: bannerPresets.items.map((preset) => ({
      key: preset.key,
      tone: preset.tone,
      icon: resolveIcon(preset.icon, icons),
      severityLabel: preset.severityLabel,
      headline: preset.headline,
      points: preset.points,
      slugs: preset.enabledSlugs,
    })).sort((a, b) => (TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone)) || a.key.localeCompare(b.key)),
    statement: { zh: copyOf("china-statement-zh"), en: copyOf("china-statement-en") },
    enums,
    sections,
    substances: substanceIndex,
    psychoactive,
    chemical,
    effects: effectIndex,
    effectCategories,
    reports: reportIndex,
    library,
    downloads,
    pages,
    molecules,
    icons,
    logo: (await readFile(path.join(repoRoot, "src/assets/dosewiki-logo.svg"), "utf8"))
      .replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->|<sodipodi:namedview[\s\S]*?\/>|<metadata[\s\S]*?<\/metadata>/g, "")
      .trim(),
  };

  const app = await readFile(path.join(repoRoot, "scripts/translation/offline/app.js"), "utf8");
  const css = await readFile(path.join(repoRoot, "scripts/translation/offline/app.css"), "utf8");

  const json = JSON.stringify(bundle);
  const gz = gzipSync(Buffer.from(json), { level: 9 });
  const html = `<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>dose.wiki 中文 · 离线版</title>
<style>${css}</style>
</head>
<body>
<div id="app"><p class="boot">正在解压数据…</p></div>
<script id="data" type="application/gzip+base64">${wrapBase64(gz.toString("base64"))}</script>
<script>${app}</script>
</body>
</html>
`;
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  const sha = createHash("sha256").update(html).digest("hex").slice(0, 16);
  console.log(
    `Wrote ${path.relative(repoRoot, outPath)}: ${(html.length / 1048576).toFixed(2)} MB (json ${(json.length / 1048576).toFixed(1)} MB, gzip ${(gz.length / 1048576).toFixed(2)} MB), ${Object.keys(pages).length} pages, ${Object.keys(molecules).length} molecules, ${Object.keys(icons).length} icons, sha256 ${sha}`,
  );
}

await main();
