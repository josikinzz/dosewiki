#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import {
  createDataOpsRunContext,
  getFlagValue,
  hasFlag,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

const ROOT_DIR = process.cwd();
const FAVICON_DIR = resolve(ROOT_DIR, "public/favicons");
const CONFIG_PATH = resolve(ROOT_DIR, "src/data/config/sourceFavicons.ts");
const DEFAULT_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 500_000;

const BASE_SOURCE_CONFIGS = [
  {
    id: "psychonautwiki",
    patterns: ["psychonautwiki.org", "psychonautwiki.net", "psychonautwiki.rip"],
    favicon: "/favicons/psychonautwiki.png",
  },
  {
    id: "erowid",
    patterns: ["erowid.org"],
    favicon: "/favicons/erowid.png",
  },
  {
    id: "tripsit",
    patterns: ["tripsit.me"],
    favicon: "/favicons/tripsit.png",
  },
  {
    id: "wikipedia",
    patterns: ["wikipedia.org", "wikimedia.org"],
    favicon: "/favicons/wikipedia.png",
  },
  {
    id: "pubmed",
    patterns: ["pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "nih.gov", "pmc.ncbi.nlm.nih.gov"],
    favicon: "/favicons/pubmed.png",
  },
  {
    id: "bluelight",
    patterns: ["bluelight.org"],
    favicon: "/favicons/bluelight.png",
  },
  {
    id: "reddit",
    patterns: ["reddit.com"],
    favicon: "/favicons/reddit.png",
  },
  {
    id: "pubchem",
    patterns: ["pubchem.ncbi.nlm.nih.gov"],
    favicon: "/favicons/pubchem.png",
  },
  {
    id: "drugbank",
    patterns: ["drugbank.com", "go.drugbank.com"],
    favicon: "/favicons/drugbank.png",
  },
  {
    id: "isomerdesign",
    patterns: ["isomerdesign.com", "tihkal.info"],
    favicon: "/favicons/isomerdesign.png",
  },
  {
    id: "thedrugclassroom",
    patterns: ["thedrugclassroom.com"],
    favicon: "/favicons/thedrugclassroom.png",
  },
  {
    id: "drugusersbible",
    patterns: ["drugusersbible.org", "drugusersbible.com"],
    urlPatterns: ["the-drug-users-bible"],
    favicon: "/favicons/drugusersbible.png",
  },
  {
    id: "dancesafe",
    patterns: ["dancesafe.org"],
    favicon: "/favicons/dancesafe.png",
  },
  {
    id: "drugs-forum",
    patterns: ["drugs-forum.com"],
    favicon: "/favicons/drugs-forum.png",
  },
  {
    id: "disregardeverythingisay",
    patterns: ["disregardeverythingisay.com"],
    favicon: "/favicons/disregardeverythingisay.png",
  },
];

const SOURCE_DISPLAY_NAME_TO_ID = {
  PsychonautWiki: "psychonautwiki",
  Erowid: "erowid",
  "TripSit Factsheets": "tripsit",
  "TripSit Wiki": "tripsit",
  Wikipedia: "wikipedia",
  DrugBank: "drugbank",
  "Isomer Design": "isomerdesign",
  "The Drug Classroom": "thedrugclassroom",
  "Drug Users Bible": "drugusersbible",
  "Disregard Everything I Say": "disregardeverythingisay",
  SaferParty: null,
  DanceSafe: "dancesafe",
  Bluelight: "bluelight",
  PubMed: "pubmed",
  Reddit: "reddit",
};

const USER_AGENT = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "AppleWebKit/537.36 (KHTML, like Gecko)",
  "dose.wiki-favicon-generator/1.0",
].join(" ");

function parsePositiveInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function hostSlug(host) {
  return host
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function trimTrailingUrlPunctuation(value) {
  return value.replace(/[\])}.,;:]+$/g, "");
}

function extractLookupUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;

  const candidates = [trimmed];
  const embeddedUrl = trimmed.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (embeddedUrl) {
    candidates.unshift(trimTrailingUrlPunctuation(embeddedUrl));
  }

  const doi = trimmed.match(/\bdoi\s*:?\s*(10\.\d{4,9}\/[^\s]+)/i)?.[1]
    ?? trimmed.match(/\b(10\.\d{4,9}\/[^\s]+)/i)?.[1];
  if (doi) {
    candidates.push(`https://doi.org/${trimTrailingUrlPunctuation(doi)}`);
  }

  const pmid = trimmed.match(/\b(?:PMID|PubMed\s+ID)\s*:?\s*(\d{5,})\b/i)?.[1];
  if (pmid) {
    candidates.push(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);
  }

  for (const candidate of candidates) {
    try {
      return new URL(candidate).toString();
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function hashColor(input) {
  const digest = createHash("sha1").update(input).digest();
  const hue = digest[0] % 360;
  const sat = 56 + (digest[1] % 16);
  const light = 34 + (digest[2] % 12);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function parseHostname(url) {
  try {
    const lookupUrl = extractLookupUrl(url);
    return lookupUrl ? normalizeHost(new URL(lookupUrl).hostname) : "";
  } catch {
    return "";
  }
}

function baseConfigCoversHost(host) {
  return BASE_SOURCE_CONFIGS.some((config) =>
    config.patterns.some((pattern) => host.includes(pattern)),
  );
}

function collectFurtherReadingHosts(articles) {
  const hosts = new Map();

  for (const article of articles) {
    const citations = Array.isArray(article?.citations) ? article.citations : [];

    for (const citation of citations) {
      const url = typeof citation?.url === "string" ? citation.url.trim() : "";
      const host = parseHostname(url);
      if (!host || baseConfigCoversHost(host)) {
        continue;
      }

      const entry = hosts.get(host) ?? {
        host,
        count: 0,
        sampleUrl: url,
        sampleTitle: typeof citation?.name === "string" ? citation.name : "",
      };
      entry.count += 1;
      hosts.set(host, entry);
    }
  }

  return [...hosts.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.host.localeCompare(right.host);
  });
}

async function readArticlesFromInput(inputPath) {
  const parsed = JSON.parse(readFileSync(resolve(ROOT_DIR, inputPath), "utf-8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.substances)) return parsed.substances;
  throw new Error(`Input file ${inputPath} is not an article array.`);
}

async function readArticlesFromData(dataUrl) {
  const client = createDataClient({ target: dataUrl }).client;
  return await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
}

function getAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function isIconRel(rel) {
  return rel
    .toLowerCase()
    .split(/\s+/)
    .some((token) => token === "icon" || token === "shortcut" || token === "apple-touch-icon" || token === "mask-icon");
}

function parseIconLinks(html, baseUrl) {
  const links = [];
  const linkRegex = /<link\b[^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const rel = getAttribute(tag, "rel");
    const href = getAttribute(tag, "href");
    if (!rel || !href || !isIconRel(rel)) {
      continue;
    }

    try {
      links.push({
        url: new URL(href, baseUrl).toString(),
        rel: rel.toLowerCase(),
        sizes: getAttribute(tag, "sizes"),
      });
    } catch {
      // Ignore invalid icon URLs.
    }
  }

  return links.sort((left, right) => iconLinkScore(right) - iconLinkScore(left));
}

function iconLinkScore(link) {
  let score = 0;
  if (link.rel.includes("apple-touch-icon")) score += 30;
  if (link.url.match(/\.(png|webp)(?:[?#].*)?$/i)) score += 20;
  if (link.url.match(/\.svg(?:[?#].*)?$/i)) score += 10;
  if (link.url.match(/\.ico(?:[?#].*)?$/i)) score -= 5;

  const sizes = link.sizes.match(/(\d+)x(\d+)/i);
  if (sizes) {
    score += Math.min(Number.parseInt(sizes[1], 10), 256) / 10;
  }

  return score;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept ?? "text/html,image/*,*/*",
        ...(options.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponsePrefix(response, maxBytes) {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }

  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf-8");
}

async function fetchHtmlIconLinks(url) {
  try {
    const response = await fetchWithTimeout(url, { accept: "text/html,*/*" });
    if (!response.ok) return [];

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("html")) {
      return [];
    }

    const html = await readResponsePrefix(response, MAX_HTML_BYTES);
    return parseIconLinks(html, response.url);
  } catch {
    return [];
  }
}

function buildCandidateUrls(host, sampleUrl) {
  const origins = [
    `https://${host}`,
    `https://www.${host}`,
    `http://${host}`,
    `http://www.${host}`,
  ];
  const candidates = [];

  if (sampleUrl) {
    candidates.push({ url: sampleUrl, type: "html" });
  }

  for (const origin of origins) {
    candidates.push({ url: origin, type: "html" });
    candidates.push({ url: `${origin}/favicon.ico`, type: "image" });
    candidates.push({ url: `${origin}/favicon.png`, type: "image" });
    candidates.push({ url: `${origin}/apple-touch-icon.png`, type: "image" });
  }

  candidates.push({
    url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    type: "image",
  });

  return candidates;
}

async function fetchImageBuffer(url) {
  const response = await fetchWithTimeout(url, {
    accept: "image/png,image/webp,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,*/*",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error("empty image");
  }
  return buffer;
}

async function normalizeIconToPng(inputBuffer, outputPath) {
  await sharp(inputBuffer, { animated: false })
    .resize(32, 32, {
      fit: "contain",
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
}

async function writeFallbackIcon(host, outputPath) {
  const color = hashColor(host);
  const label = host.replace(/^www\./, "").charAt(0).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="${color}"/>
      <text x="32" y="39" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#fbe7ff">${label}</text>
    </svg>
  `;
  await normalizeIconToPng(Buffer.from(svg), outputPath);
}

async function downloadFaviconForHost(entry, { force }) {
  const slug = hostSlug(entry.host);
  const outputPath = resolve(FAVICON_DIR, `${slug}.png`);
  const publicPath = `/favicons/${slug}.png`;

  if (!force && existsSync(outputPath)) {
    return { ...entry, id: slug, favicon: publicPath, status: "existing" };
  }

  const candidates = buildCandidateUrls(entry.host, entry.sampleUrl);
  const imageUrls = [];

  for (const candidate of candidates) {
    if (candidate.type === "html") {
      imageUrls.push(...(await fetchHtmlIconLinks(candidate.url)));
      continue;
    }

    imageUrls.push({ url: candidate.url, rel: "direct", sizes: "" });
  }

  const seen = new Set();
  for (const candidate of imageUrls) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);

    try {
      const buffer = await fetchImageBuffer(candidate.url);
      await normalizeIconToPng(buffer, outputPath);
      return {
        ...entry,
        id: slug,
        favicon: publicPath,
        status: candidate.url.includes("google.com/s2/favicons") ? "google-fallback" : "fetched",
        sourceUrl: candidate.url,
      };
    } catch {
      // Try the next candidate.
    }
  }

  await writeFallbackIcon(entry.host, outputPath);
  return { ...entry, id: slug, favicon: publicPath, status: "generated-fallback" };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function escapeString(value) {
  return JSON.stringify(value);
}

function formatSourceConfig(config) {
  const lines = [
    "  {",
    `    id: ${escapeString(config.id)},`,
    `    patterns: ${JSON.stringify(config.patterns)},`,
  ];

  if (config.urlPatterns?.length) {
    lines.push(`    urlPatterns: ${JSON.stringify(config.urlPatterns)},`);
  }

  lines.push(`    favicon: ${escapeString(config.favicon)},`);
  lines.push("  }");
  return lines.join("\n");
}

function writeSourceFaviconConfig(discoveredEntries) {
  const discoveredConfigs = discoveredEntries.map((entry) => ({
    id: entry.id,
    patterns: [entry.host],
    favicon: entry.favicon,
  })).sort((left, right) => {
    const leftPattern = left.patterns[0] ?? "";
    const rightPattern = right.patterns[0] ?? "";
    if (rightPattern.length !== leftPattern.length) {
      return rightPattern.length - leftPattern.length;
    }
    return leftPattern.localeCompare(rightPattern);
  });
  const configs = [...BASE_SOURCE_CONFIGS, ...discoveredConfigs];
  const displayNameEntries = Object.entries(SOURCE_DISPLAY_NAME_TO_ID)
    .map(([name, id]) => `  ${escapeString(name)}: ${id === null ? "null" : escapeString(id)},`)
    .join("\n");

  const content = `// Auto-generated source favicon configuration
// Maps URL patterns to favicon files
// Generated by scripts/data/generate-further-reading-favicons.mjs

export interface SourceConfig {
  id: string;
  patterns: string[];
  urlPatterns?: string[];
  favicon: string;
}

export const sourceConfigs: SourceConfig[] = [
${configs.map(formatSourceConfig).join(",\n")}
];

/**
 * Map display names from quotes files to source IDs.
 * Used to look up favicons for sources extracted from markdown quotes.
 */
export const sourceDisplayNameToId: Record<string, string | null> = {
${displayNameEntries}
};

function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(/[\\])}.,;:]+$/g, "");
}

function extractLookupUrl(value: string): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;

  const candidates = [trimmed];
  const embeddedUrl = trimmed.match(/https?:\\/\\/[^\\s<>"']+/i)?.[0];
  if (embeddedUrl) {
    candidates.unshift(trimTrailingUrlPunctuation(embeddedUrl));
  }

  const doi = trimmed.match(/\\bdoi\\s*:?\\s*(10\\.\\d{4,9}\\/[^\\s]+)/i)?.[1]
    ?? trimmed.match(/\\b(10\\.\\d{4,9}\\/[^\\s]+)/i)?.[1];
  if (doi) {
    candidates.push(\`https://doi.org/\${trimTrailingUrlPunctuation(doi)}\`);
  }

  const pmid = trimmed.match(/\\b(?:PMID|PubMed\\s+ID)\\s*:?\\s*(\\d{5,})\\b/i)?.[1];
  if (pmid) {
    candidates.push(\`https://pubmed.ncbi.nlm.nih.gov/\${pmid}/\`);
  }

  for (const candidate of candidates) {
    try {
      return new URL(candidate).toString();
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

/**
 * Get favicon path for a citation URL or legacy citation text containing a URL, DOI, or PMID.
 */
export function getFaviconForUrl(url: string): string | null {
  try {
    const lookupUrl = extractLookupUrl(url);
    if (!lookupUrl) return null;

    const parsedUrl = new URL(lookupUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const fullUrl = lookupUrl.toLowerCase();

    for (const source of sourceConfigs) {
      if (source.patterns.some((pattern) => hostname.includes(pattern))) {
        return source.favicon;
      }

      if (source.urlPatterns?.some((pattern) => fullUrl.includes(pattern))) {
        return source.favicon;
      }
    }
  } catch {
    // Invalid URL.
  }

  return null;
}

/**
 * Get favicon path for a source display name (from quotes files).
 */
export function getFaviconForSourceName(name: string): string | null {
  const id = sourceDisplayNameToId[name];
  if (!id) return null;
  const config = sourceConfigs.find((source) => source.id === id);
  return config?.favicon ?? null;
}
`;

  writeFileSync(CONFIG_PATH, content);
}

function printSummary(results) {
  const counts = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
    return summary;
  }, {});

  console.log("\nFavicon results:");
  for (const [status, count] of Object.entries(counts).sort()) {
    console.log(`  ${status}: ${count}`);
  }

  const fallback = results.filter((result) => result.status === "generated-fallback");
  if (fallback.length > 0) {
    console.log("\nGenerated fallback icons:");
    for (const result of fallback.slice(0, 40)) {
      console.log(`  ${result.host}`);
    }
    if (fallback.length > 40) {
      console.log(`  ...and ${fallback.length - 40} more`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const inputPath = getFlagValue(argv, "--input");
  const hostFilter = getFlagValue(argv, "--host");
  const limitValue = getFlagValue(argv, "--limit");
  const limit = parsePositiveInteger(limitValue, Number.POSITIVE_INFINITY);
  const concurrency = parsePositiveInteger(getFlagValue(argv, "--concurrency"), DEFAULT_CONCURRENCY);
  const force = hasFlag(argv, "--force");
  const reportOnly = hasFlag(argv, "--report-only") || hasFlag(argv, "--dry-run");
  const partialRun = Boolean(hostFilter || limitValue);

  const runContext = createDataOpsRunContext({
    operation: "generate further-reading favicons",
    intent: "local-asset-generation",
    argv,
    sourceUrlKeys: ["SOURCE_POSTGRES_URL", "SOURCE_POSTGRES_URL", "POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL", "POSTGRES_POOLED_URL"],
    targetUrlKeys: [],
    localArtifacts: ["public/favicons", "src/data/config/sourceFavicons.ts"],
    dryRunFlag: "--dry-run",
    executeFlag: null,
  });

  printDataOpsRunContext(runContext);
  console.log("");

  const articles = inputPath
    ? await readArticlesFromInput(inputPath)
    : await readArticlesFromData(requireSourceUrl(runContext, "Postgres read source URL"));

  let hosts = collectFurtherReadingHosts(articles);
  if (hostFilter) {
    hosts = hosts.filter((entry) => entry.host.includes(hostFilter));
  }
  hosts = hosts.slice(0, limit);

  console.log(`Found ${hosts.length} further-reading host${hosts.length === 1 ? "" : "s"} outside the base source-page registry.`);

  if (reportOnly) {
    for (const entry of hosts) {
      console.log(`${entry.host}\t${entry.count}\t${entry.sampleTitle}`);
    }
    return;
  }

  if (partialRun) {
    throw new Error("Refusing to write a partial favicon registry. Use --report-only with --host/--limit, or run without filters.");
  }

  mkdirSync(FAVICON_DIR, { recursive: true });

  const results = await mapWithConcurrency(hosts, concurrency, async (entry, index) => {
    const result = await downloadFaviconForHost(entry, { force });
    console.log(`[${index + 1}/${hosts.length}] ${entry.host} -> ${result.favicon} (${result.status})`);
    return result;
  });

  writeSourceFaviconConfig(results);
  printSummary(results);
  console.log(`\nUpdated ${CONFIG_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
