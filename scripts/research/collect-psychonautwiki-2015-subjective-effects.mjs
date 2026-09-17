#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, process.env.PW_SUBJECTIVE_EFFECTS_OUT_DIR || "content/sources/psychonautwiki-2015");
const ARTICLE_DIR = path.join(OUT_DIR, "articles");
const CACHE_DIR = path.join(OUT_DIR, ".cache");
const LIVE_MISSING_PATH = path.join(CACHE_DIR, "live-missing-subjective-effects.json");
const LIVE_SUBSTANCES_PATH = path.join(CACHE_DIR, "live-dosewiki-substances.json");
const MANIFEST_PATH = path.join(ROOT, "src/data/articleSourceManifest.json");
const PARSED_SOURCES_PATH = path.join(ROOT, "src/data/parsed-sources.json");
const ARCHIVE_SOURCE_DIR = path.join(ROOT, "archive/drug-info-articles");

const LAST_ALLOWED_TIMESTAMP = process.env.PW_LAST_ALLOWED_TIMESTAMP || "20151231235959";
const DEFAULT_TARGET_TIMESTAMPS = [
  "20160831235959",
  "20160331235959",
  "20151231235959",
  "20150921124532",
  "20150924220651",
  "20150815165909",
  "20150424000000",
  "20150318000000",
];
const TARGET_TIMESTAMPS = (process.env.PW_TARGET_TIMESTAMPS || "")
  .split(",")
  .map((timestamp) => timestamp.trim())
  .filter(Boolean);
if (TARGET_TIMESTAMPS.length === 0) TARGET_TIMESTAMPS.push(...DEFAULT_TARGET_TIMESTAMPS);
const REQUEST_DELAY_MS = Number(process.env.IA_DELAY_MS || "300");
const FETCH_TIMEOUT_MS = Number(process.env.IA_TIMEOUT_MS || "25000");
const MODE = getArg("--mode") || "all";
const ONLY_SLUG = getArg("--slug");
const MANUAL_TITLE = getArg("--title");
const LIMIT = Number(getArg("--limit") || "0");
const DISCOVERY = getArg("--discovery") || "memento";
const CANDIDATE_SCOPE = getArg("--candidate-scope") || "full";
const FORCE = process.argv.includes("--force");
const RETRY_STATUSES = new Set((getArg("--retry-statuses") || "").split(",").map((status) => status.trim()).filter(Boolean));

fs.mkdirSync(ARTICLE_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const missing = loadMissingArticles();
const hintedCandidates = buildHintedCandidateMap(missing);
const parsedSourceNames = loadParsedSourceNames();

let queue = missing;
if (ONLY_SLUG) queue = queue.filter((article) => article.slug === ONLY_SLUG);
if (MODE === "hinted") queue = queue.filter((article) => hintedCandidates.has(article.slug));
if (MODE === "unhinted") queue = queue.filter((article) => !hintedCandidates.has(article.slug));
if (LIMIT > 0) queue = queue.slice(0, LIMIT);

const existingResults = loadJsonIfExists(path.join(CACHE_DIR, "collection-results.json"), []);
const resultBySlug = new Map(existingResults.map((result) => [result.slug, result]));
const collected = [];

for (let index = 0; index < queue.length; index += 1) {
  const article = queue[index];
  const existing = resultBySlug.get(article.slug);
  if (existing && !FORCE && !RETRY_STATUSES.has(existing.status)) {
    console.log(`[${index + 1}/${queue.length}] ${article.slug}: skip existing ${existing.status}`);
    continue;
  }
  const candidates = buildCandidates(article, hintedCandidates, parsedSourceNames);
  console.log(`[${index + 1}/${queue.length}] ${article.slug}: ${candidates.map((c) => c.title).join(", ")}`);

  const result = await collectArticle(article, candidates);
  resultBySlug.set(article.slug, result);
  if (result.status === "collected") {
    collected.push(result.slug);
    writeArticleMarkdown(result);
    console.log(`  collected ${result.archiveTimestamp} ${result.archiveUrl}`);
  } else {
    console.log(`  ${result.status}`);
  }

  writeJson(path.join(CACHE_DIR, "collection-results.json"), [...resultBySlug.values()].sort(compareBySlug));
  writeIndexFiles([...resultBySlug.values()].sort(compareBySlug));
}

console.log(`Done. Collected this run: ${collected.length}`);

function getArg(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function loadMissingArticles() {
  if (fs.existsSync(LIVE_MISSING_PATH)) {
    return JSON.parse(fs.readFileSync(LIVE_MISSING_PATH, "utf8"));
  }
  const rows = JSON.parse(fs.readFileSync(LIVE_SUBSTANCES_PATH, "utf8"));
  return rows
    .filter((article) => !hasNonemptySubjectiveEffects(article.subjective_effects))
    .map(({ slug, title }) => ({ slug, title }));
}

function hasNonemptySubjectiveEffects(subjectiveEffects) {
  if (!subjectiveEffects || typeof subjectiveEffects !== "object") return false;
  let count = 0;
  function walk(value) {
    if (typeof value === "string" && value.trim()) {
      count += 1;
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "attribution") continue;
        walk(child);
      }
    }
  }
  walk(subjectiveEffects);
  return count > 0;
}

function buildHintedCandidateMap(articles) {
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const candidates = new Map();

  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    for (const substance of manifest.substances ?? []) {
      const source = substance.sources?.find((entry) => entry.id === "psychonautwiki");
      if (!source) continue;
      const slug = slugify(substance.name);
      if (!bySlug.has(slug)) continue;
      addHint(candidates, slug, stripPsychonautWikiFileName(source.fileName), "articleSourceManifest");
    }
  }

  if (fs.existsSync(ARCHIVE_SOURCE_DIR)) {
    for (const filePath of walkFiles(ARCHIVE_SOURCE_DIR)) {
      if (!filePath.includes("PSYCHONAUTWIKI - ") || !filePath.endsWith(".md")) continue;
      const fileTitle = stripPsychonautWikiFileName(path.basename(filePath));
      const folderTitle = path.basename(path.dirname(filePath));
      for (const title of [fileTitle, folderTitle]) {
        const slug = slugify(title);
        if (!bySlug.has(slug)) continue;
        addHint(candidates, slug, fileTitle, "archiveSourceFile");
      }
    }
  }

  return candidates;
}

function addHint(map, slug, title, reason) {
  if (!title) return;
  if (!map.has(slug)) map.set(slug, []);
  const list = map.get(slug);
  if (!list.some((item) => item.title === title)) list.push({ title, reason });
}

function loadParsedSourceNames() {
  if (!fs.existsSync(PARSED_SOURCES_PATH)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(PARSED_SOURCES_PATH, "utf8"));
  const map = new Map();
  for (const [slug, entry] of Object.entries(parsed.substances ?? {})) {
    if (entry?.name) map.set(slug, entry.name);
  }
  return map;
}

function buildCandidates(article, hintedMap, parsedNames) {
  const candidates = [];
  const seen = new Set();
  if (ONLY_SLUG && MANUAL_TITLE) addCandidate(MANUAL_TITLE, "manualTitle");
  for (const hint of hintedMap.get(article.slug) ?? []) addCandidate(hint.title, hint.reason);
  addCandidate(article.title, "dosewikiTitle");
  addCandidate(article.title.replace(/\s+/g, "_"), "dosewikiTitleUnderscore");
  if (parsedNames.has(article.slug)) addCandidate(parsedNames.get(article.slug), "parsedSourcesName");
  if (CANDIDATE_SCOPE === "primary") return candidates;

  addCandidate(article.slug.toUpperCase(), "slugUppercase");
  addCandidate(article.slug, "slug");

  return candidates;

  function addCandidate(title, reason) {
    const cleanTitle = normalizeWikiTitle(title);
    const key = cleanTitle.toLowerCase();
    if (!cleanTitle || seen.has(key)) return;
    seen.add(key);
    candidates.push({ title: cleanTitle, reason });
  }
}

async function collectArticle(article, candidates) {
  const attempts = [];
  if (DISCOVERY === "cdx") {
    return await collectArticleViaCdx(article, candidates, attempts);
  }
  for (const candidate of candidates) {
    for (const targetTimestamp of TARGET_TIMESTAMPS) {
      for (const protocol of ["https", "http"]) {
        const originalUrl = `${protocol}://psychonautwiki.org/wiki/${encodeWikiPath(candidate.title)}`;
        const requestUrl = `https://web.archive.org/web/${targetTimestamp}id_/${originalUrl}`;
        const attempt = await fetchArchivedSection(requestUrl, candidate, originalUrl);
        attempts.push(attempt.summary);
        if (attempt.result) {
          return {
            slug: article.slug,
            title: article.title,
            status: "collected",
            sourceTitle: attempt.result.sourceTitle,
            candidateReason: candidate.reason,
            originalUrl: attempt.result.originalUrl,
            archiveTimestamp: attempt.result.archiveTimestamp,
            archiveDate: timestampToIso(attempt.result.archiveTimestamp),
            archiveUrl: attempt.result.archiveUrl,
            mementoUrl: attempt.result.mementoUrl,
            sectionMarkdown: attempt.result.sectionMarkdown,
            sectionChars: attempt.result.sectionMarkdown.length,
            effectBulletCount: countEffectBullets(attempt.result.sectionMarkdown),
            attempts,
          };
        }
        if (
          targetTimestamp === LAST_ALLOWED_TIMESTAMP &&
          attempt.summary.archiveTimestamp &&
          attempt.summary.archiveTimestamp > LAST_ALLOWED_TIMESTAMP
        ) {
          return {
            slug: article.slug,
            title: article.title,
            status: "no_2015_archive_found",
            attempts,
          };
        }
      }
    }
  }
  return {
    slug: article.slug,
    title: article.title,
    status: attempts.some((attempt) => attempt.archiveTimestamp && attempt.archiveTimestamp <= LAST_ALLOWED_TIMESTAMP)
      ? "no_2015_subjective_effects_section"
      : "no_2015_archive_found",
    attempts,
  };
}

async function collectArticleViaCdx(article, candidates, attempts) {
  for (const candidate of candidates) {
    const cdxResult = await fetchCdxRows(candidate);
    attempts.push(cdxResult.summary);
    if (cdxResult.rows.length === 0) continue;

    const rows = cdxResult.rows
      .filter((row) => row.timestamp <= LAST_ALLOWED_TIMESTAMP)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));

    for (const row of rows) {
      const requestUrl = `https://web.archive.org/web/${row.timestamp}id_/${row.original}`;
      const attempt = await fetchArchivedSection(requestUrl, candidate, row.original);
      attempts.push(attempt.summary);
      if (attempt.result) {
        return {
          slug: article.slug,
          title: article.title,
          status: "collected",
          sourceTitle: attempt.result.sourceTitle,
          candidateReason: candidate.reason,
          originalUrl: attempt.result.originalUrl,
          archiveTimestamp: attempt.result.archiveTimestamp,
          archiveDate: timestampToIso(attempt.result.archiveTimestamp),
          archiveUrl: attempt.result.archiveUrl,
          mementoUrl: attempt.result.mementoUrl,
          sectionMarkdown: attempt.result.sectionMarkdown,
          sectionChars: attempt.result.sectionMarkdown.length,
          effectBulletCount: countEffectBullets(attempt.result.sectionMarkdown),
          attempts,
        };
      }
    }
  }

  return {
    slug: article.slug,
    title: article.title,
    status: attempts.some((attempt) => attempt.rowsFound > 0 || (attempt.archiveTimestamp && attempt.archiveTimestamp <= LAST_ALLOWED_TIMESTAMP))
      ? "no_2015_subjective_effects_section"
      : "no_2015_archive_found",
    attempts,
  };
}

async function fetchCdxRows(candidate) {
  await sleep(REQUEST_DELAY_MS);
  const cdxUrl = new URL("https://web.archive.org/cdx");
  cdxUrl.searchParams.set("url", `psychonautwiki.org/wiki/${normalizeWikiTitle(candidate.title)}`);
  cdxUrl.searchParams.set("from", "20150101000000");
  cdxUrl.searchParams.set("to", LAST_ALLOWED_TIMESTAMP);
  cdxUrl.searchParams.set("output", "json");
  cdxUrl.searchParams.set("fl", "timestamp,original,statuscode,mimetype,digest");
  cdxUrl.searchParams.append("filter", "statuscode:200");
  cdxUrl.searchParams.append("filter", "mimetype:text/html");
  cdxUrl.searchParams.set("collapse", "digest");
  cdxUrl.searchParams.set("limit", "20");

  try {
    const response = await fetchWithRetry(cdxUrl.toString(), {
      maxAttempts: Number(process.env.IA_CDX_ATTEMPTS || "1"),
      timeoutMs: Number(process.env.IA_CDX_TIMEOUT_MS || "6000"),
    });
    const text = await response.text();
    const json = JSON.parse(text);
    const [header, ...rows] = Array.isArray(json) ? json : [];
    const parsedRows = Array.isArray(header)
      ? rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])))
      : [];
    return {
      rows: parsedRows,
      summary: {
        candidate: candidate.title,
        reason: candidate.reason,
        cdxUrl: cdxUrl.toString(),
        rowsFound: parsedRows.length,
      },
    };
  } catch (error) {
    return {
      rows: [],
      summary: {
        candidate: candidate.title,
        reason: candidate.reason,
        cdxUrl: cdxUrl.toString(),
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchArchivedSection(requestUrl, candidate, originalUrl) {
  await sleep(REQUEST_DELAY_MS);
  try {
    const response = await fetchWithRetry(requestUrl);
    const finalUrl = response.url;
    const archiveTimestamp = parseArchiveTimestamp(finalUrl);
    const summary = {
      candidate: candidate.title,
      reason: candidate.reason,
      requested: requestUrl,
      status: response.status,
      archiveTimestamp,
      finalUrl,
    };
    if (!archiveTimestamp || archiveTimestamp > LAST_ALLOWED_TIMESTAMP) return { summary };
    if (response.status !== 200) return { summary };

    const html = await response.text();
    const extraction = extractSubjectiveEffectsMarkdown(html);
    summary.hasSubjectiveEffects = Boolean(extraction);
    if (!extraction) return { summary };

    return {
      summary,
      result: {
        sourceTitle: extraction.pageTitle || candidate.title,
        originalUrl: extractOriginalUrl(finalUrl) || originalUrl,
        archiveTimestamp,
        archiveUrl: finalUrl.replace(`/web/${archiveTimestamp}id_/`, `/web/${archiveTimestamp}/`),
        mementoUrl: finalUrl,
        sectionMarkdown: extraction.markdown,
      },
    };
  } catch (error) {
    return {
      summary: {
        candidate: candidate.title,
        reason: candidate.reason,
        requested: requestUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchWithRetry(url, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "dose.wiki local archival research (web.archive.org only)",
        },
      });
      clearTimeout(timer);
      return response;
    } catch (error) {
      lastError = error;
      await sleep(1000 + attempt * 2000);
    }
  }
  throw lastError;
}

function extractSubjectiveEffectsMarkdown(html) {
  if (!html.includes("mw-headline") || !html.includes("Subjective")) return null;
  const dom = new JSDOM(html);
  const { document } = dom.window;
  removeNoise(document);
  const headline = [...document.querySelectorAll(".mw-headline")].find((node) => {
    const id = node.getAttribute("id")?.toLowerCase();
    const text = normalizeHeadingText(node.textContent);
    return id === "subjective_effects" || text === "subjective effects";
  });
  if (!headline) return null;

  const heading = headline.closest("h1,h2,h3,h4,h5,h6");
  if (!heading) return null;
  const headingLevel = Number(heading.tagName.slice(1));
  const nodes = [];
  for (let node = heading; node; node = node.nextElementSibling) {
    if (node !== heading && /^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= headingLevel) {
      break;
    }
    nodes.push(node);
  }

  const markdown = normalizeMarkdown(nodes.map((node) => blockToMarkdown(node, headingLevel)).filter(Boolean).join("\n\n"));
  if (markdown.length < 120 || !/subjective effects/i.test(markdown)) return null;
  return {
    pageTitle: document.querySelector(".firstheading, .firstHeading, h1")?.textContent?.trim() || null,
    markdown,
  };
}

function removeNoise(document) {
  for (const selector of [
    "script",
    "style",
    "sup.reference",
    ".mw-editsection",
    ".noprint",
    ".metadata",
    ".error",
  ]) {
    for (const node of document.querySelectorAll(selector)) node.remove();
  }
}

function blockToMarkdown(node, rootLevel) {
  const tag = node.tagName?.toLowerCase();
  if (!tag) return "";
  if (/^h[1-6]$/.test(tag)) {
    const rawLevel = Number(tag.slice(1));
    const level = Math.max(2, rawLevel - rootLevel + 2);
    return `${"#".repeat(level)} ${cleanInlineText(node.textContent)}`;
  }
  if (tag === "p") return cleanInlineText(inlineToMarkdown(node));
  if (tag === "ul" || tag === "ol") return listToMarkdown(node);
  if (tag === "blockquote") return cleanInlineText(node.textContent).split("\n").map((line) => `> ${line}`).join("\n");
  if (tag === "dl") return [...node.children].map((child) => blockToMarkdown(child, rootLevel)).filter(Boolean).join("\n");
  if (tag === "dd" || tag === "dt") return cleanInlineText(inlineToMarkdown(node));
  if (tag === "table") return tableToMarkdown(node);
  if (tag === "div" || tag === "section") {
    return [...node.children].map((child) => blockToMarkdown(child, rootLevel)).filter(Boolean).join("\n\n");
  }
  return cleanInlineText(inlineToMarkdown(node));
}

function listToMarkdown(list, depth = 0) {
  const ordered = list.tagName.toLowerCase() === "ol";
  const lines = [];
  let index = 1;
  for (const item of [...list.children].filter((child) => child.tagName?.toLowerCase() === "li")) {
    const clone = item.cloneNode(true);
    const nested = [...clone.children].filter((child) => ["ul", "ol"].includes(child.tagName?.toLowerCase()));
    for (const child of nested) child.remove();
    const ownText = cleanInlineText(inlineToMarkdown(clone));
    const marker = ordered ? `${index}.` : "-";
    if (ownText) lines.push(`${"  ".repeat(depth)}${marker} ${ownText}`);
    for (const child of nested) lines.push(listToMarkdown(child, depth + 1));
    index += 1;
  }
  return lines.filter(Boolean).join("\n");
}

function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll("tr")]
    .map((row) => [...row.querySelectorAll("th,td")].map((cell) => cleanInlineText(cell.textContent)))
    .filter((row) => row.length > 0);
  if (rows.length === 0) return "";
  return rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function inlineToMarkdown(node) {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const tag = node.tagName.toLowerCase();
  if (["script", "style", "sup"].includes(tag)) return "";
  const children = [...node.childNodes].map(inlineToMarkdown).join("");
  if (tag === "b" || tag === "strong") return children.trim() ? `**${cleanInlineText(children)}**` : "";
  if (tag === "i" || tag === "em") return children.trim() ? `*${cleanInlineText(children)}*` : "";
  if (tag === "br") return "\n";
  return children;
}

function normalizeMarkdown(markdown) {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+\[/g, " [")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .replace(/[ \t]+$/g, "")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInlineText(value) {
  return String(value ?? "")
    .replace(/\[\s*edit\s*\]/gi, "")
    .replace(/\[\s*\d+\s*\]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

function writeArticleMarkdown(result) {
  const articlePath = path.join(ARTICLE_DIR, `${result.slug}.md`);
  const content = [
    "---",
    `slug: ${JSON.stringify(result.slug)}`,
    `title: ${JSON.stringify(result.title)}`,
    `source_title: ${JSON.stringify(result.sourceTitle)}`,
    "dosewiki_had_subjective_effects: false",
    'source: "Internet Archive capture of PsychonautWiki"',
    `archive_timestamp: ${JSON.stringify(result.archiveTimestamp)}`,
    `archive_date_utc: ${JSON.stringify(result.archiveDate)}`,
    `archive_url: ${JSON.stringify(result.archiveUrl)}`,
    `original_url: ${JSON.stringify(result.originalUrl)}`,
    "---",
    "",
    `# ${result.title}`,
    "",
    "## TODO",
    "",
    "- [ ] Review and adapt this 2015 subjective effects section into the dose.wiki `subjective_effects` schema.",
    "- [ ] Preserve attribution to Josie Kins and this exact Internet Archive capture date.",
    `- [ ] Do not replace from live PsychonautWiki or any capture after ${timestampToIso(LAST_ALLOWED_TIMESTAMP)}.`,
    "",
    "## Source",
    "",
    `- Internet Archive capture: [${result.archiveTimestamp} UTC](${result.archiveUrl})`,
    `- Exact capture date: ${result.archiveDate}`,
    `- Archived original URL: \`${result.originalUrl}\``,
    `- Candidate match: ${result.sourceTitle} (${result.candidateReason})`,
    "",
    result.sectionMarkdown,
    "",
  ].join("\n");
  fs.writeFileSync(articlePath, content, "utf8");
}
function writeIndexFiles(results) {
  const collected = results.filter((result) => result.status === "collected").sort(compareBySlug);
  const skipped = results.filter((result) => result.status !== "collected").sort(compareBySlug);
  const pending = missing.filter((article) => !results.some((result) => result.slug === article.slug));

  const readme = [
    "# PsychonautWiki 2015 subjective effects recovery",
    "",
    `Scope: local staging only. Source fetches use \`web.archive.org\` mementos of PsychonautWiki pages and reject any capture after ${timestampToIso(LAST_ALLOWED_TIMESTAMP)}.`,
    "",
    "## Run todo",
    "",
    `- [x] Query live dose.wiki Postgres/public data for missing subjective effects (${missing.length} missing).`,
    `- [x] Collect archived 2015 subjective effects sections found so far (${collected.length}).`,
    `- [${pending.length === 0 ? "x" : " "}] Finish probing missing dose.wiki substances (${pending.length} pending).`,
    "- [ ] Review collected files and adapt into dose.wiki schema in a separate write task.",
    "",
    "## Collected article todo",
    "",
    ...collected.map((result) => `- [ ] [${result.title}](articles/${result.slug}.md) - ${result.archiveTimestamp} UTC`),
    "",
    "## No 2015 subjective effects section found",
    "",
    ...skipped.map((result) => `- [x] ${result.title} (${result.slug}) - ${result.status}`),
    "",
    "## Pending probe",
    "",
    ...pending.map((article) => `- [ ] ${article.title} (${article.slug})`),
    "",
  ].join("\n");

  const skippedMd = [
    "# Missing dose.wiki substances with no collected 2015 PsychonautWiki subjective effects section",
    "",
    ...skipped.map((result) => `- ${result.title} (${result.slug}): ${result.status}`),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(OUT_DIR, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "not-found-2015.md"), skippedMd, "utf8");
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function loadJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function stripPsychonautWikiFileName(fileName) {
  return fileName.replace(/^PSYCHONAUTWIKI - /, "").replace(/\.md$/i, "");
}

function normalizeWikiTitle(title) {
  return String(title ?? "")
    .trim()
    .replace(/^https?:\/\/psychonautwiki\.org\/wiki\//i, "")
    .replace(/^\/wiki\//i, "")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, "_");
}

function encodeWikiPath(title) {
  return normalizeWikiTitle(title)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function parseArchiveTimestamp(url) {
  return url.match(/\/web\/(\d{14})/)?.[1] ?? null;
}

function extractOriginalUrl(url) {
  const match = url.match(/\/web\/\d{14}(?:id_)?\/(.+)$/);
  return match ? match[1] : null;
}

function timestampToIso(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`;
}

function normalizeHeadingText(value) {
  return cleanInlineText(value).toLowerCase().replace(/\s+/g, " ");
}

function countEffectBullets(markdown) {
  return markdown.split("\n").filter((line) => /^-\s+/.test(line)).length;
}

function compareBySlug(left, right) {
  return left.slug.localeCompare(right.slug);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[αΑ]/g, "alpha")
    .replace(/[μµΜ]/g, "mu")
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
