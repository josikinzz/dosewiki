import "server-only";

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const TRANSLATION_PACK_LOCALE = "zh-Hans";

const REBUILD_COMMAND = "npm run translate:packs";

const PACK_DIR = path.posix.join("public/downloads", TRANSLATION_PACK_LOCALE);
const MANIFEST_FILE = path.posix.join(PACK_DIR, "manifest.json");

const packFileSchema = z.object({
  file: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  items: z.number().int().nonnegative(),
});

const manifestSchema = z.object({
  locale: z.string().min(1),
  generatedAt: z.iso.datetime(),
  note: z.string().min(1),
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
      markdown: z.object({ [TRANSLATION_PACK_LOCALE]: packFileSchema, en: packFileSchema }).optional(),
    }),
  ),
});

export type TranslationPackFile = z.infer<typeof packFileSchema> & {
  href: string;
};

export type TranslationPack = Omit<z.infer<typeof manifestSchema>["datasets"][number], "packs" | "markdown"> & {
  translated: TranslationPackFile;
  source: TranslationPackFile;
  markdown: { translated: TranslationPackFile; source: TranslationPackFile } | null;
};

export type TranslationPackIndex = {
  locale: string;
  generatedAt: string;
  note: string;
  packs: TranslationPack[];
  markdownTree: (TranslationPackFile & { target: string; targetLicense: string }) | null;
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
        file: z.string().min(1),
        markdown: z.array(z.string()).optional(),
      }),
    ),
  ),
});

export type TranslationSamplePair = z.infer<typeof samplesSchema>["samples"][string][number] & { href: string };

export type TranslationSamples = { samples: Record<string, TranslationSamplePair[]> };

let cachedSamples: TranslationSamples | null | undefined;

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
