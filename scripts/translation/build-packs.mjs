#!/usr/bin/env node
/**
 * Dataset pack builder.
 *
 * Turns every corpus artifact into a pair of downloadable files under
 * `public/downloads/<locale>/`: the locale translation and the English source
 * it was translated from, in the same structure and record order, so a reader
 * can hold one beside the other. The output directory is gitignored; it is
 * built before each deploy and ships as a deployment artifact, never as a
 * commit. The manifest names each dataset, its licence, the revision of the
 * source, both item counts, both checksums, and the review verdict, which
 * stays null until a reader of the language records one in the corpus QA
 * packet. The packs exist so that review can happen; the verdict travels with
 * them rather than gating them.
 *
 * Determinism does the load-bearing work: building twice from unchanged
 * inputs produces identical bytes, so a rebuild that changes a checksum means
 * the data changed. The gzip container is written with a zero timestamp for
 * the same reason.
 *
 * Usage:
 *   node scripts/translation/build-packs.mjs [--locale zh-Hans] [--check]
 */

import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateRawSync, gzipSync, constants as zlibConstants } from "node:zlib";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { CORPORA } from "./corpora.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Reader-facing catalogue, in the order the page lists them: the three bodies
 * of content first, the registry that renders them beside those, then the
 * remaining prose.
 */
const PACKS = [
  {
    id: "substances",
    noun: "substances",
    nounZh: "种物质",
    title: "Substance index",
    titleZh: "物质索引",
    summary: "Every substance article: dosage, duration, effects, pharmacology, interactions, harm potential, legality.",
    summaryZh: "全部物质条目：剂量、持续时间、效应、药理学、相互作用、危害潜力、法律地位。",
  },
  {
    id: "effects",
    noun: "effects",
    nounZh: "种效应",
    title: "Subjective effect index",
    titleZh: "主观效应索引",
    summary: "Every subjective effect article (description, analysis, style variations, personal commentary) plus the 26 effect categories with their definitions and members.",
    summaryZh: "全部主观效应条目（描述、分析、风格变体、个人评述），以及 26 个效应类别的定义与成员。",
  },
  {
    id: "reports",
    noun: "reports",
    nounZh: "篇报告",
    title: "Trip reports",
    titleZh: "体验报告",
    summary: "Every published first-person report with its onset, peak and offset timeline.",
    summaryZh: "全部已发布的第一人称报告，附起效、峰值与消退的时间线。",
  },
  {
    id: "layout",
    noun: "entries",
    nounZh: "个条目",
    title: "Layout and taxonomy",
    titleZh: "版式与分类体系",
    summary: "Section names, field labels, dose tiers, duration stages, legal statuses, routes, classes and effect-name aliases: what a page needs to render the three indexes above.",
    summaryZh: "章节名、字段标签、剂量等级、持续时间阶段、法律状态、给药途径、分类与效应别名：渲染上述三个索引所需的一切。",
  },
  {
    id: "articles",
    noun: "articles",
    nounZh: "篇文章",
    title: "Library",
    titleZh: "资料库",
    summary: "The Effect Index library: intensity scales, dreaming and consciousness, the DMT and DXM guides, and the five class summaries (visual, cognitive and miscellaneous effects of psychedelics; dissociatives; deliriants).",
    summaryZh: "效应索引的资料库：强度量表、梦与意识、DMT 与 DXM 指南，以及五篇类别综述（迷幻剂的视觉、认知与其他效应；解离剂；谵妄剂）。",
  },

  {
    id: "copy",
    noun: "blocks",
    nounZh: "个文本块",
    title: "Sitewide copy",
    titleZh: "站点文案",
    summary: "Taglines, category introductions, docs pages, empty states, the about and licence pages.",
    summaryZh: "标语、类别介绍、文档页、空状态、关于页与许可页。",
  },
  {
    id: "banners",
    noun: "banners",
    nounZh: "条警示",
    title: "Safety banners",
    titleZh: "安全警示横幅",
    summary: "The drug-class warnings that head an article, each with the substance slugs it is enabled on.",
    summaryZh: "置于条目顶部的类别安全警示，每条附有其启用的物质条目标识。",
  },
];
const PACK_ORDER = new Map(PACKS.map((pack, index) => [pack.id, index]));

/**
 * Corpora that ship inside another dataset rather than as a card of their own:
 * the artifact's records become a sibling array beside `items` in the host's
 * JSON, and its Markdown pages join the host's zip. The site groups them the
 * same way (categories under the effect index, summaries in the Library).
 */
const FOLDS = {
  effectCategories: { into: "effects", key: "categories" },
  summaries: { into: "articles", key: "summaries" },
};
const FOLDED_INTO = new Map();
for (const [id, fold] of Object.entries(FOLDS)) {
  FOLDED_INTO.set(fold.into, [...(FOLDED_INTO.get(fold.into) ?? []), id]);
}

const LICENSE_URL = "https://dose.wiki/docs/license";
const SITE_URL = "https://dose.wiki";

/**
 * The manifest is public. A corpus loaded from the database or a repository
 * export records a local origin (a handler name or a checkout path) in its QA
 * packet; the reader-facing source for those is the site itself.
 */
function publicSourceUrl(origin) {
  return typeof origin === "string" && /^https?:\/\//.test(origin) ? origin : SITE_URL;
}

/** Sample pairs per dataset shown on the downloads page. Each pair is one whole record, fetched on demand. */
const SAMPLE_PAIRS = 6;

/**
 * Deterministic pick of record indexes, spread across the dataset. A seeded
 * pick keeps two builds of unchanged inputs byte-identical; the page shuffles
 * among the picks at view time.
 */
function sampleIndexes(count, wanted) {
  if (count <= wanted) return Array.from({ length: count }, (_, i) => i);
  const step = count / wanted;
  return Array.from({ length: wanted }, (_, i) => Math.floor(i * step + step / 2));
}

/**
 * A whole record as a reader compares it, prose first so the two sides open
 * on sentences rather than a wall of citations that read the same in both.
 */
function sampleView(record) {
  const lead = ["title", "name", "label", "summary", "description", "body", "introduction"];
  const rank = (key) => (lead.includes(key) ? lead.indexOf(key) : lead.length);
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => rank(a) - rank(b)));
}

/**
 * A zip archive of `entries` (archive path -> bytes), written by hand so that
 * every name carries the UTF-8 flag (general purpose bit 11): the system
 * `zip` on macOS leaves it unset and Chinese filenames come out as mojibake on
 * extraction. Entries are stored deflated, in sorted order, with a fixed
 * timestamp, so two builds of the same tree are byte-identical.
 */
function zipArchive(entries) {
  const names = [...entries.keys()].sort((a, b) => a.localeCompare(b));
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = ((2001 - 1980) << 9) | (1 << 5) | 1; // 2001-01-01
  const FLAGS = 0x0800; // UTF-8 names
  const METHOD = 8; // deflate
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = entries.get(name);
    const packed = deflateRawSync(data, { level: zlibConstants.Z_BEST_COMPRESSION });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(METHOD, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAGS, 8);
    central.writeUInt16LE(METHOD, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, end]);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Zip of files on disk: archive path -> absolute source path. */
async function zipFiles(paths) {
  const entries = new Map();
  for (const [name, source] of paths) entries.set(name, await readFile(source));
  return zipArchive(entries);
}

/** Title-ish label for a record, in whichever field the dataset uses. */
function recordLabel(record) {
  return String(record?.title ?? record?.name ?? record?.label ?? record?.key ?? record?.slug ?? "");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * A gzip member carries a modification time in its header. Left to default it
 * is the clock, and two builds of identical data would differ in bytes.
 */
function deterministicGzip(text) {
  return gzipSync(Buffer.from(text, "utf8"), { level: zlibConstants.Z_BEST_COMPRESSION, mtime: 0 });
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * Corpora the runner knows, restricted to those with an output directory. The
 * locale root also holds the FreeODwiki tree and the glossary audit, which are
 * derived from packs rather than packable themselves.
 */
function collectCorpora(localeDir) {
  return Object.keys(CORPORA)
    .filter((id) => existsSync(path.join(localeDir, id)))
    .sort();
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      locale: { type: "string", default: "zh-Hans" },
      check: { type: "boolean", default: false },
    },
  });

  const locale = values.locale;
  const localeDir = path.join(repoRoot, "notes-and-plans/exports/translation", locale);
  const outDir = path.join(repoRoot, "public/downloads", locale);

  const corpusIds = collectCorpora(localeDir);
  if (corpusIds.length === 0) {
    console.error(`No corpus artifacts under ${path.relative(repoRoot, localeDir)}. Run translate:locale first.`);
    process.exit(1);
  }

  const datasets = [];
  const refused = [];
  const files = new Map();
  const samples = {};
  const artifactsById = new Map();
  const loaded = new Map();

  for (const id of corpusIds) {
    const corpusDir = path.join(localeDir, id);
    const packetPath = path.join(corpusDir, "qa-packet.json");
    if (!existsSync(packetPath)) {
      refused.push({ id, reason: "no QA packet; the run did not finish" });
      continue;
    }

    const packet = await readJson(packetPath);
    const corpus = CORPORA[id];
    const datasetName = packet.dataset ?? corpus?.dataset ?? id;
    const artifactPath = path.join(corpusDir, `${datasetName}.${locale}.json`);
    const sourcePath = path.join(corpusDir, "source-export.json");

    if (!existsSync(artifactPath)) {
      refused.push({ id, reason: `no artifact at ${path.relative(repoRoot, artifactPath)}` });
      continue;
    }
    if (!existsSync(sourcePath)) {
      refused.push({ id, reason: `no English source at ${path.relative(repoRoot, sourcePath)}` });
      continue;
    }

    const verdict = typeof packet.verdict === "string" ? packet.verdict.trim() : "";

    loaded.set(id, { packet, datasetName, verdict, artifactPath, sourcePath });
  }

  for (const [id, { packet, datasetName, verdict, artifactPath, sourcePath }] of loaded) {
    if (FOLDS[id]) continue;

    // The Chinese and the English it was translated from travel together, so a
    // reader can hold one beside the other. Same structure, same record order.
    // A folded corpus rides along as a sibling array in both.
    const withFolds = async (file, language) => {
      const artifact = JSON.parse(await readFile(file, "utf8"));
      for (const foldedId of FOLDED_INTO.get(id) ?? []) {
        const folded = loaded.get(foldedId);
        if (!folded) continue;
        const foldedFile = language === "en" ? folded.sourcePath : folded.artifactPath;
        artifact[FOLDS[foldedId].key] = JSON.parse(await readFile(foldedFile, "utf8")).items;
      }
      return `${JSON.stringify(artifact)}\n`;
    };
    const pair = [
      { language: locale, text: await withFolds(artifactPath, locale), fileName: `${datasetName}.${locale}.json.gz` },
      { language: "en", text: await withFolds(sourcePath, "en"), fileName: `${datasetName}.en.json.gz` },
    ];
    const packs = {};
    for (const { language, text, fileName } of pair) {
      const body = deterministicGzip(text);
      const artifact = JSON.parse(text);
      files.set(fileName, body);
      packs[language] = {
        file: fileName,
        bytes: body.byteLength,
        sha256: sha256(body),
        // Folded records count too; a reader downloading "9 articles" gets 14.
        items: (artifact.items?.length ?? 0)
          + (FOLDED_INTO.get(id) ?? []).reduce((total, foldedId) => total + (artifact[FOLDS[foldedId].key]?.length ?? 0), 0),
      };
    }

    const artifact = JSON.parse(pair[0].text);
    const sourceArtifact = JSON.parse(pair[1].text);
    artifactsById.set(id, artifact);
    // The two artifacts share record order, so index i is the same record in both.
    samples[id] = sampleIndexes(artifact.items.length, SAMPLE_PAIRS).map((index) => {
      const file = `samples/${id}-${index}.json`;
      files.set(
        file,
        Buffer.from(
          JSON.stringify(
            {
              translated: JSON.stringify(sampleView(artifact.items[index]), null, 2),
              source: JSON.stringify(sampleView(sourceArtifact.items[index]), null, 2),
            },
            null,
            0,
          ),
          "utf8",
        ),
      );
      return {
        index,
        labelZh: recordLabel(artifact.items[index]),
        label: recordLabel(sourceArtifact.items[index]),
        file,
      };
    });
    datasets.push({
      id,
      dataset: datasetName,
      ...(PACKS.find((pack) => pack.id === id) ?? { title: datasetName, titleZh: datasetName, summary: "", summaryZh: "", noun: "items", nounZh: "项" }),
      license: artifact.license ?? null,
      licenseUrl: artifact.licenseUrl ?? LICENSE_URL,
      sourceUrl: publicSourceUrl(packet.source ?? artifact.source),
      sourceGeneratedAt: packet.sourceGeneratedAt ?? artifact.translationOf ?? null,
      verdict: verdict.length > 0 ? verdict : null,
      coverage: {
        segments: packet.coverage?.segments ?? null,
        validatedPercent: packet.coverage?.validatedPercent ?? null,
      },
      packs,
    });
  }

  // FreeODwiki-shaped Markdown: one zip per dataset per language plus the
  // whole Chinese drop-in tree. The exporter's report names the file for
  // every record, so the Markdown sample for a sampled record is a lookup.
  const trees = {
    [locale]: path.join(localeDir, "freeodwiki"),
    en: path.join(localeDir, "freeodwiki-en"),
  };
  let markdownTree = null;
  for (const [language, treeDir] of Object.entries(trees)) {
    const reportPath = path.join(treeDir, "export-report.json");
    if (!existsSync(reportPath)) continue;
    const report = await readJson(reportPath);
    const byCorpus = new Map();
    for (const page of report.pages ?? []) {
      if (!byCorpus.has(page.corpus)) byCorpus.set(page.corpus, []);
      byCorpus.get(page.corpus).push(page);
    }
    for (const dataset of datasets) {
      const pages = [dataset.id, ...(FOLDED_INTO.get(dataset.id) ?? [])].flatMap((corpusId) => byCorpus.get(corpusId) ?? []);
      if (pages.length === 0) continue;
      const entries = new Map(pages.map((page) => [page.path, path.join(treeDir, page.path)]));
      const patch = (report.patches ?? []).find((entry) => entry.file.includes(`${pages[0].path.split("/")[0]}-index`));
      if (patch) entries.set(patch.file, path.join(treeDir, patch.file));
      const body = await zipFiles(entries);
      const fileName = `${dataset.dataset}.${language}.freeodwiki.zip`;
      files.set(fileName, body);
      dataset.markdown ??= {};
      dataset.markdown[language] = { file: fileName, bytes: body.byteLength, sha256: sha256(body), items: pages.length };
      for (const sample of samples[dataset.id]) {
        const slug = String(artifactsById.get(dataset.id).items[sample.index]?.slug ?? "");
        const page = pages.find((entry) => entry.corpus === dataset.id && entry.slug === slug);
        if (!page) continue;
        sample.markdown ??= {};
        sample.markdown[language] = await readFile(path.join(treeDir, page.path), "utf8");
      }
    }
    if (language === locale) {
      const whole = new Map();
      for (const page of report.pages ?? []) whole.set(page.path, path.join(treeDir, page.path));
      for (const patch of report.patches ?? []) whole.set(patch.file, path.join(treeDir, patch.file));
      whole.set("export-report.json", reportPath);
      const body = await zipFiles(whole);
      files.set("FreeODwiki.zip", body);
      markdownTree = { file: "FreeODwiki.zip", bytes: body.byteLength, sha256: sha256(body), items: (report.pages ?? []).length, target: report.target, targetLicense: report.targetLicense };
    }
  }

  datasets.sort((a, b) => (PACK_ORDER.get(a.id) ?? 99) - (PACK_ORDER.get(b.id) ?? 99));

  const manifest = {
    locale,
    generatedAt: new Date().toISOString(),
    builder: "npm run translate:packs",
    note: "Each dataset ships as a pair: the Simplified Chinese translation and the English it was translated from, in the same structure. The verdict field is empty until a reader of the language has recorded one.",
    datasets,
    markdown: markdownTree,
  };

  if (values.check) {
    const manifestPath = path.join(outDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      console.error("No manifest on disk; nothing to compare.");
      process.exit(1);
    }
    const onDisk = await readJson(manifestPath);
    const drift = [];
    for (const dataset of datasets) {
      const previous = onDisk.datasets?.find((entry) => entry.id === dataset.id);
      if (!previous) {
        drift.push(`${dataset.id}: absent from the published manifest`);
        continue;
      }
      for (const [language, pack] of Object.entries(dataset.packs)) {
        if (previous.packs?.[language]?.sha256 !== pack.sha256) drift.push(`${dataset.id} (${language}): checksum changed`);
      }
      for (const [language, pack] of Object.entries(dataset.markdown ?? {})) {
        if (previous.markdown?.[language]?.sha256 !== pack.sha256) drift.push(`${dataset.id} (markdown ${language}): checksum changed`);
      }
    }
    for (const previous of onDisk.datasets ?? []) {
      if (!datasets.some((dataset) => dataset.id === previous.id)) {
        drift.push(`${previous.id}: published but no longer built`);
      }
    }
    for (const line of drift) console.error(`  drift: ${line}`);
    console.log(`${drift.length === 0 ? "No drift" : `${drift.length} differences`} against the published manifest.`);
    process.exit(drift.length === 0 ? 0 : 1);
  }

  await rm(path.join(outDir, "samples"), { recursive: true, force: true });
  await mkdir(path.join(outDir, "samples"), { recursive: true });
  for (const [name, body] of files) {
    await writeFile(path.join(outDir, name), body);
  }
  // Sample files carry the Markdown pages beside the two JSON sides; the
  // index only says which languages a sample has.
  for (const [id, pairs] of Object.entries(samples)) {
    for (const sample of pairs) {
      if (!sample.markdown) continue;
      const file = path.join(outDir, `samples/${id}-${sample.index}.json`);
      const record = await readJson(file);
      record.markdown = sample.markdown;
      await writeFile(file, JSON.stringify(record));
      sample.markdown = Object.keys(sample.markdown);
    }
  }
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outDir, "samples.json"), `${JSON.stringify({ samples }, null, 2)}\n`);

  console.log(`Locale        ${locale}`);
  console.log(`Packed        ${datasets.length} datasets into ${path.relative(repoRoot, outDir)}`);
  for (const dataset of datasets) {
    for (const [language, pack] of [...Object.entries(dataset.packs), ...Object.entries(dataset.markdown ?? {})]) {
      const size = (await stat(path.join(outDir, pack.file))).size;
      console.log(`  ${pack.file.padEnd(38)} ${language.padEnd(7)} ${String(pack.items).padStart(5)} items  ${(size / 1024 / 1024).toFixed(2)} MB`);
    }
  }
  if (refused.length > 0) {
    console.log(`Refused       ${refused.length}`);
    for (const entry of refused) console.error(`  ${entry.id}: ${entry.reason}`);
  }
  if (datasets.length === 0) {
    console.error("\nNothing was packed.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
