import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../../src/utils/slug.ts";
import { publicHref } from "../../src/utils/publicHref.ts";
import {
  getMechanismPath,
  parseMechanismEntry,
  splitMechanismActivity,
} from "../../src/features/article/components/sections/pharmacologyMechanisms.ts";
import { tripReportSlug } from "../../src/features/reports/submissions/tripReportSubmissions.ts";
import { playlistKeyOf } from "../../src/features/dev/tools/replication-studio/replicationPlaylistModel.ts";

const BASE_COMMIT = "b6f459783";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CORPUS_DIRS = ["data", "content"];

const legacy = {
  utilsSlugify: (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim(),
  mechanismToSlug: (moa: string) =>
    moa
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  slugifySubstanceTitle: (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  tripReportSlugify: (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled-report",
  titleToSlug: (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  routeEquivalenceArticleSlug: (article: { slug?: string; title?: unknown } | null | undefined) =>
    article?.slug || String(article?.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  applyCitationsSlugify: (value: unknown) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "source",
  publicProseSlugify: (value: unknown) =>
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  psychonautwikiSlugify: (value: unknown) =>
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[αΑ]/g, "alpha")
      .replace(/[μµΜ]/g, "mu")
      .replace(/&/g, "and")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  toFileSlug: (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  toDiffFileName: (heading: string) => {
    const normalized = heading.trim().toLowerCase();
    if (!normalized) {
      return "article";
    }
    const slug = normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "article";
  },
  navChildSlug: (label: string) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  psychoactiveSummarySectionId: (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  slugifyArtistLabel: (label: string) =>
    label
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  playlistKeyOf: (title: string) =>
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
};

const legacyMechanismPath = (base: string, qualifier?: string) => {
  const baseSlug = legacy.mechanismToSlug(base);
  const qualifierSlug = qualifier ? legacy.mechanismToSlug(qualifier) : undefined;
  return { baseSlug, qualifierSlug, href: publicHref.mechanism(baseSlug, qualifierSlug) };
};

type Site = {
  site: string;
  inputs: "strings" | "mechanismPairs" | "loose";
  legacy: (input: never) => unknown;
  next: (input: never) => unknown;
};

const sites: Site[] = [
  { site: "src/utils/slug.ts slugify", inputs: "strings", legacy: legacy.utilsSlugify, next: slugify },
  {
    site: "pharmacologyMechanisms.ts getMechanismPath",
    inputs: "mechanismPairs",
    legacy: ([base, qualifier]: [string, string | undefined]) => legacyMechanismPath(base, qualifier),
    next: ([base, qualifier]: [string, string | undefined]) => getMechanismPath(base, qualifier),
  },
  {
    site: "publicData.readProjections.ts substance fallback slug",
    inputs: "strings",
    legacy: legacy.slugifySubstanceTitle,
    next: slugify,
  },
  {
    site: "tripReportSubmissions.ts (client and server) report slug",
    inputs: "strings",
    legacy: legacy.tripReportSlugify,
    next: tripReportSlug,
  },
  { site: "scripts/lib/slug.mjs slugify", inputs: "strings", legacy: legacy.titleToSlug, next: slugify },
  { site: "scripts/batch/*/ titleToSlug (8 copies)", inputs: "strings", legacy: legacy.titleToSlug, next: slugify },
  {
    site: "route-equivalence-fill.mjs articleSlug",
    inputs: "loose",
    legacy: (title: unknown) => legacy.routeEquivalenceArticleSlug({ title }),
    next: (title: unknown) => slugify(String(title ?? "")),
  },
  {
    site: "apply-citations.mjs claim and reference slug",
    inputs: "loose",
    legacy: legacy.applyCitationsSlugify,
    next: (value: unknown) => slugify(String(value ?? "")) || "source",
  },
  {
    site: "public-prose-artifact-language-core.mjs fallback slug",
    inputs: "loose",
    legacy: legacy.publicProseSlugify,
    next: (value: unknown) =>
      slugify(String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")),
  },
  {
    site: "collect-psychonautwiki-2015-subjective-effects.mjs slug",
    inputs: "loose",
    legacy: legacy.psychonautwikiSlugify,
    next: (value: unknown) =>
      slugify(
        String(value ?? "")
          .normalize("NFKD")
          .replace(/[αΑ]/g, "alpha")
          .replace(/[μµΜ]/g, "mu")
          .replace(/&/g, "and"),
      ),
  },
  { site: "useDevModeChangeLog.ts export file slug", inputs: "strings", legacy: legacy.toFileSlug, next: slugify },
  {
    site: "changelog.ts diff file name",
    inputs: "strings",
    legacy: legacy.toDiffFileName,
    next: (heading: string) => slugify(heading) || "article",
  },
  { site: "routeChrome.ts nav child id", inputs: "strings", legacy: legacy.navChildSlug, next: slugify },
  {
    site: "PsychoactiveSummaryPage.tsx section id",
    inputs: "strings",
    legacy: legacy.psychoactiveSummarySectionId,
    next: slugify,
  },
  {
    site: "galleryArtistIdentity.ts artist URL slug",
    inputs: "strings",
    legacy: legacy.slugifyArtistLabel,
    next: (label: string) => slugify(label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")),
  },
  { site: "replicationPlaylistModel.ts playlistKeyOf", inputs: "strings", legacy: legacy.playlistKeyOf, next: playlistKeyOf },
];

const EDGE_CASES = [
  "", " ", "-", "--", "--a--", " -a- ", "a", "A", "MDMA", "2C-B", "4-AcO-DMT", "5-MeO-DMT",
  "α-PVP", "αMT", "Α-methyltryptamine", "µ-opioid receptor agonist", "μ-opioid", "Μ-opioid", "κ-opioid",
  "5-HT2A receptor agonist (partial)", "NMDA receptor antagonist (weak)", "GABA-A receptor positive allosteric modulator",
  "Café", "Éther", "naïve", "İstanbul", "ß", "ﬁx", "Ｆｕｌｌｗｉｄｔｈ", "Ⅻ", "K", "ſ", "ǅ", "Ǆ",
  "数据", "Привет мир", "مرحبا", "🙂 emoji 🙂", "a&b", "A & B", "Tom & Jerry's", "tab\tsep", "new\nline",
  "\u00a0nbsp\u00a0", "\u200bzero-width", "trailing-", "-leading", "_under_score_", "dots.and.dots",
  "UPPER lower 123", "2,5-dimethoxy-4-iodoamphetamine", "Ł ódź", "ðøþæœ", "  spaced   out  ",
  "Untitled", "untitled-report", "source", "article", "https://www.example.com/path?q=1",
];

const LOOSE_EXTRAS: unknown[] = [null, undefined, 0, 42, -1.5, true, false];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function collectJsonStrings(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    out.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectJsonStrings(item, out));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.add(key);
      collectJsonStrings(item, out);
    }
  }
}

function collectTextStrings(text: string, out: Set<string>): void {
  for (const line of text.split(/\r?\n/)) {
    out.add(line);
    const trimmed = line.trim();
    out.add(trimmed);
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) out.add(heading[1]);
    const field = trimmed.match(/^[\w-]+:\s*(.+)$/);
    if (field) out.add(field[1].replace(/^["']|["']$/g, ""));
    for (const piece of trimmed.split(/[|,;]/)) out.add(piece.trim());
  }
}

function deriveInputs(value: string, out: Set<string>, pairs: Map<string, [string, string | undefined]>): void {
  const { base, qualifier } = parseMechanismEntry(value);
  out.add(base);
  if (qualifier) out.add(qualifier);
  pairs.set(JSON.stringify([base, qualifier ?? null]), [base, qualifier]);
  out.add(splitMechanismActivity(base).site);
  out.add(value.replace(/\s*\([^)]*\)\s*$/, ""));
  if (/^https?:\/\//.test(value)) {
    try {
      out.add(new URL(value).hostname.replace(/^www\./, ""));
    } catch {
      out.add(value);
    }
  }
}

function buildCorpus() {
  const raw = new Set<string>(EDGE_CASES);
  const files = CORPUS_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".json")) {
      collectJsonStrings(JSON.parse(text), raw);
    } else {
      collectTextStrings(text, raw);
    }
  }
  const strings = new Set(raw);
  const mechanismPairs = new Map<string, [string, string | undefined]>();
  for (const value of raw) deriveInputs(value, strings, mechanismPairs);
  for (const value of strings) mechanismPairs.set(JSON.stringify([value, null]), [value, undefined]);
  return { files: files.map((file) => relative(ROOT, file)), strings: [...strings], mechanismPairs: [...mechanismPairs.values()] };
}

const corpus = buildCorpus();
const inputsFor: Record<Site["inputs"], readonly unknown[]> = {
  strings: corpus.strings,
  mechanismPairs: corpus.mechanismPairs,
  loose: [...corpus.strings, ...LOOSE_EXTRAS],
};

console.log(`Legacy implementations frozen from ${BASE_COMMIT}.`);
console.log(`Corpus: ${corpus.files.length} files under ${CORPUS_DIRS.join(", ")}.`);
console.log(`Inputs: ${corpus.strings.length} unique strings, ${corpus.mechanismPairs.length} mechanism (base, qualifier) pairs, ${LOOSE_EXTRAS.length} non-string values.`);

let comparisons = 0;
let mismatches = 0;
for (const { site, inputs, legacy: before, next: after } of sites) {
  let siteMismatches = 0;
  for (const input of inputsFor[inputs]) {
    const expected = JSON.stringify(before(input as never));
    const actual = JSON.stringify(after(input as never));
    comparisons += 1;
    if (expected !== actual) {
      siteMismatches += 1;
      if (siteMismatches <= 20) {
        console.error(`MISMATCH ${site}: input=${JSON.stringify(input)} legacy=${expected} new=${actual}`);
      }
    }
  }
  mismatches += siteMismatches;
  console.log(`${siteMismatches === 0 ? "identical" : "DIFFERS  "} ${String(inputsFor[inputs].length).padStart(6)} inputs  ${site}`);
}

console.log(`${comparisons} comparisons across ${sites.length} sites, ${mismatches} mismatches.`);
process.exitCode = mismatches === 0 ? 0 : 1;
