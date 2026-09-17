import "server-only";

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * The one locale the translation programme has shipped. The packs live under
 * `public/downloads/<locale>/`, so the reader's URL and this constant are the
 * same string. That directory is gitignored: `npm run translate:packs` builds
 * it before each deploy and the files ship as deployment artifacts, so on a
 * checkout that has not run the build the manifest is simply absent.
 */
export const TRANSLATION_PACK_LOCALE = "zh-Hans";

/** What to run when the manifest is absent, stale, or missing a file. */
const REBUILD_COMMAND = "npm run translate:packs";

const PACK_DIR = path.posix.join("public/downloads", TRANSLATION_PACK_LOCALE);
const MANIFEST_FILE = path.posix.join(PACK_DIR, "manifest.json");

const packFileSchema = z.object({
  file: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  items: z.number().int().nonnegative(),
});

/**
 * The manifest `npm run translate:packs` writes beside the gzipped packs.
 *
 * Every caption the page prints is required here, so a pack can never be
 * listed with a defaulted count, licence, or checksum. Each dataset is a pair
 * of files, the translation and the English it came from; `verdict` is null
 * until a reader of the language has recorded one.
 */
const manifestSchema = z.object({
  locale: z.string().min(1),
  generatedAt: z.iso.datetime(),
  note: z.string().min(1),
  /** The whole FreeODwiki-shaped tree as one archive, or null when the exporter has not run. */
  markdown: packFileSchema.extend({ target: z.string().min(1), targetLicense: z.string().min(1) }).nullable(),
  datasets: z.array(
    z.object({
      id: z.string().min(1),
      dataset: z.string().min(1),
      title: z.string().min(1),
      titleZh: z.string().min(1),
      summary: z.string(),
      summaryZh: z.string(),
      noun: z.string().min(1),
      nounZh: z.string().min(1),
      license: z.string().min(1),
      licenseUrl: z.string().min(1),
      sourceUrl: z.string().min(1),
      sourceGeneratedAt: z.iso.datetime(),
      verdict: z.string().min(1).nullable(),
      packs: z.object({ [TRANSLATION_PACK_LOCALE]: packFileSchema, en: packFileSchema }),
      /** FreeODwiki-shaped Markdown pages per language; absent for datasets with no page form. */
      markdown: z.object({ [TRANSLATION_PACK_LOCALE]: packFileSchema, en: packFileSchema }).optional(),
    }),
  ),
});

/**
 * One downloadable file, with `bytes` measured on the file the reader
 * receives rather than taken on the manifest's word.
 */
export type TranslationPackFile = z.infer<typeof packFileSchema> & {
  /** Public URL of the gzipped file. */
  href: string;
};

/** One dataset: its translation beside its English source. */
export type TranslationPack = Omit<z.infer<typeof manifestSchema>["datasets"][number], "packs" | "markdown"> & {
  translated: TranslationPackFile;
  source: TranslationPackFile;
  /** FreeODwiki-shaped Markdown pages, translated and English; null for datasets with no page form. */
  markdown: { translated: TranslationPackFile; source: TranslationPackFile } | null;
};

export type TranslationPackIndex = {
  locale: string;
  generatedAt: string;
  note: string;
  packs: TranslationPack[];
  markdownTree: (TranslationPackFile & { target: string; targetLicense: string }) | null;
  /** The single-file offline reader (`translate:offline`), or null when it has not been built. */
  offline: { file: string; bytes: number; href: string } | null;
};

const OFFLINE_FILE = "dose.wiki.zh-Hans.html";

function offlineEdition(): TranslationPackIndex["offline"] {
  const absolute = path.join(process.cwd(), PACK_DIR, OFFLINE_FILE);
  if (!existsSync(absolute)) return null;
  return { file: OFFLINE_FILE, bytes: statSync(absolute).size, href: `/${path.posix.join("downloads", TRANSLATION_PACK_LOCALE, OFFLINE_FILE)}` };
}

function provenFile(file: z.infer<typeof packFileSchema>): TranslationPackFile {
  let bytes: number;
  try {
    bytes = statSync(path.join(process.cwd(), PACK_DIR, file.file)).size;
  } catch {
    throw new Error(`${MANIFEST_FILE} lists ${file.file}, which is not in ${PACK_DIR}; rerun ${REBUILD_COMMAND}`);
  }
  // A size that disagrees with the manifest means the manifest describes some
  // other build of the file, so its checksum caption would be a claim about
  // bytes nobody has.
  if (bytes !== file.bytes) {
    throw new Error(
      `${MANIFEST_FILE} states ${file.bytes} bytes for ${file.file}, which is ${bytes} bytes on disk; rerun ${REBUILD_COMMAND}`,
    );
  }
  return { ...file, bytes, href: `/${path.posix.join("downloads", TRANSLATION_PACK_LOCALE, file.file)}` };
}

function readTranslationPacks(): TranslationPackIndex | null {
  let source: string;
  try {
    source = readFileSync(path.join(process.cwd(), MANIFEST_FILE), "utf8");
  } catch (error) {
    // A checkout that has never run the pack builder is a normal state: the
    // page says so rather than failing. Anything else is a real fault.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON; rerun ${REBUILD_COMMAND}`);
  }

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${MANIFEST_FILE} is malformed (${detail}); rerun ${REBUILD_COMMAND}`);
  }

  // The builder writes a manifest even when it refused every artifact, so an
  // empty dataset list is the same reader-facing state as no manifest at all.
  if (parsed.data.datasets.length === 0) return null;

  return {
    locale: parsed.data.locale,
    generatedAt: parsed.data.generatedAt,
    note: parsed.data.note,
    packs: parsed.data.datasets.map(({ packs, markdown, ...dataset }) => ({
      ...dataset,
      translated: provenFile(packs[TRANSLATION_PACK_LOCALE]),
      source: provenFile(packs.en),
      markdown: markdown
        ? { translated: provenFile(markdown[TRANSLATION_PACK_LOCALE]), source: provenFile(markdown.en) }
        : null,
    })),
    markdownTree: parsed.data.markdown
      ? { ...provenFile(parsed.data.markdown), target: parsed.data.markdown.target, targetLicense: parsed.data.markdown.targetLicense }
      : null,
    offline: offlineEdition(),
  };
}

let cached: TranslationPackIndex | null | undefined;

/**
 * The translation packs this deployment ships, or null when none have been
 * built. Read once per process: the packs are committed files that cannot
 * change between deploys, exactly like the molecule pack beside them.
 */
export function getTranslationPacks(): TranslationPackIndex | null {
  if (cached === undefined) {
    cached = readTranslationPacks();
  }
  return cached;
}

const SAMPLES_FILE = path.posix.join(PACK_DIR, "samples.json");

const samplesSchema = z.object({
  samples: z.record(
    z.string(),
    z.array(
      z.object({
        index: z.number().int().nonnegative(),
        label: z.string(),
        labelZh: z.string(),
        /** Path under the pack directory of a `{ translated, source, markdown? }` JSON file holding the whole record on each side; `markdown` is keyed by language. */
        file: z.string().min(1),
        /** Languages whose emitted Markdown page the sample file carries, when the dataset has a page form. */
        markdown: z.array(z.string()).optional(),
      }),
    ),
  ),
});

/** One aligned record, with `href` pointing at the file the browser fetches when a reader opens it. */
export type TranslationSamplePair = z.infer<typeof samplesSchema>["samples"][string][number] & { href: string };

export type TranslationSamples = { samples: Record<string, TranslationSamplePair[]> };

let cachedSamples: TranslationSamples | null | undefined;

/**
 * The aligned record pairs the pack builder cut from each dataset for the
 * downloads page, or null when the packs are absent. Same lifetime rules as
 * the manifest.
 */
export function getTranslationSamples(): TranslationSamples | null {
  if (cachedSamples !== undefined) return cachedSamples;
  let source: string;
  try {
    source = readFileSync(path.join(process.cwd(), SAMPLES_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return (cachedSamples = null);
    throw error;
  }
  const parsed = samplesSchema.safeParse(JSON.parse(source));
  if (!parsed.success) {
    throw new Error(`${SAMPLES_FILE} is malformed; rerun ${REBUILD_COMMAND}`);
  }
  const samples: Record<string, TranslationSamplePair[]> = {};
  for (const [id, pairs] of Object.entries(parsed.data.samples)) {
    samples[id] = pairs.map((pair) => {
      if (!existsSync(path.join(process.cwd(), PACK_DIR, pair.file))) {
        throw new Error(`${SAMPLES_FILE} lists ${pair.file}, which is not in ${PACK_DIR}; rerun ${REBUILD_COMMAND}`);
      }
      return { ...pair, href: `/${path.posix.join("downloads", TRANSLATION_PACK_LOCALE, pair.file)}` };
    });
  }
  return (cachedSamples = { samples });
}
