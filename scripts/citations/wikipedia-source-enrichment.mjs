import { WIKIPEDIA_DISCOVERY_INSTRUCTION } from "./citation-evidence-policy.mjs";

const WIKIPEDIA_USER_AGENT = "DoseWikiFormalCitations/1.0 (https://dose.wiki)";
const MAX_WIKIPEDIA_REFERENCE_CANDIDATES = 12;
const MAX_WIKIPEDIA_EXCERPTS_PER_SECTION = 18;
const MAX_WIKIPEDIA_EXCERPT_CHARS = 2600;

const WIKIPEDIA_SECTION_HEADINGS_BY_SECTION = Object.freeze({
  pharmacology: ["Pharmacology", "Pharmacodynamics", "Pharmacokinetics", "Metabolism"],
  harm_potential: ["Adverse effects", "Toxicity", "Overdose"],
  legality: ["Legal status", "Regulation"],
  history_culture: ["History", "Society and culture"],
});

function nowIso() {
  return new Date().toISOString();
}

function cleanWikiMarkup(value) {
  return String(value ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/''+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value, maxChars) {
  const text = String(value ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function normalizeHeading(value) {
  return cleanWikiMarkup(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function selectYear(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function extractIdentifiersFromText(value) {
  const text = String(value ?? "");
  const doiMatch = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i);
  const pmidMatch = text.match(/\bPMID\s*:?\s*(\d{5,10})\b/i) ?? text.match(/\bpubmed(?:\s+id)?\s*:?\s*(\d{5,10})\b/i);
  const isbnMatch = text.match(/\b(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dX]\b/i);
  const urlMatch = text.match(/\bhttps?:\/\/[^\s)<>"']+/i);

  return {
    doi: doiMatch ? doiMatch[0].replace(/[.,;]+$/g, "") : null,
    pmid: pmidMatch ? pmidMatch[1] : null,
    isbn: isbnMatch ? isbnMatch[0].replace(/[-\s]/g, "") : null,
    url: urlMatch ? urlMatch[0].replace(/[.,;}\]]+$/g, "") : null,
  };
}

function findBalancedTemplate(raw, startIndex) {
  let depth = 0;
  for (let index = startIndex; index < raw.length - 1; index += 1) {
    const pair = raw.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }
  return null;
}

function findCitationTemplate(rawCitation) {
  const raw = String(rawCitation ?? "");
  const templateStartPattern = /\{\{\s*(cite[\s_-]?[a-z0-9_-]*|citation)\b/gi;
  let match;
  while ((match = templateStartPattern.exec(raw)) !== null) {
    const template = findBalancedTemplate(raw, match.index);
    if (template) return template;
  }
  return null;
}

function splitTopLevelTemplateParts(templateBody) {
  const parts = [];
  let current = "";
  let braceDepth = 0;
  let linkDepth = 0;

  for (let index = 0; index < templateBody.length; index += 1) {
    const pair = templateBody.slice(index, index + 2);
    if (pair === "{{") {
      braceDepth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "}}" && braceDepth > 0) {
      braceDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }
    if (templateBody[index] === "|" && braceDepth === 0 && linkDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += templateBody[index];
  }

  parts.push(current.trim());
  return parts;
}

function splitTemplateField(part) {
  let braceDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < part.length; index += 1) {
    const pair = part.slice(index, index + 2);
    if (pair === "{{") {
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}" && braceDepth > 0) {
      braceDepth -= 1;
      index += 1;
      continue;
    }
    if (pair === "[[") {
      linkDepth += 1;
      index += 1;
      continue;
    }
    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      index += 1;
      continue;
    }
    if (part[index] === "=" && braceDepth === 0 && linkDepth === 0) {
      return [part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim()];
    }
  }
  return [null, part.trim()];
}

function parseTemplateFields(rawTemplate) {
  const body = rawTemplate.trim().replace(/^\{\{/, "").replace(/\}\}$/, "");
  const parts = splitTopLevelTemplateParts(body);
  const templateName = parts.shift()?.trim() ?? "";
  const fields = {};

  for (const part of parts) {
    const [key, value] = splitTemplateField(part);
    if (!key) continue;
    fields[key] = value;
  }

  return { templateName, fields };
}

function parseAuthorList(fields) {
  const authors = [];
  const vauthors = fields.vauthors ?? fields.authors ?? fields.author;
  if (vauthors) {
    authors.push(...String(vauthors).split(/;| and /i).map((entry) => cleanWikiMarkup(entry)).filter(Boolean));
  }

  for (let index = 1; index <= 16; index += 1) {
    const last = fields[`last${index}`] ?? fields[`surname${index}`];
    const first = fields[`first${index}`] ?? fields[`given${index}`];
    if (last || first) {
      authors.push(cleanWikiMarkup([first, last].filter(Boolean).join(" ")));
    }
  }

  return [...new Set(authors.filter(Boolean))];
}

function parseWikipediaCitationText(rawCitation) {
  const raw = String(rawCitation ?? "").trim();
  const { doi, pmid, isbn, url } = extractIdentifiersFromText(raw);
  const templateText = findCitationTemplate(raw);
  const template = templateText ? parseTemplateFields(templateText) : null;
  const fields = template?.fields ?? {};
  const title = cleanWikiMarkup(
    fields.title ??
    fields.chapter ??
    fields.work ??
    raw.match(/"([^"]+)"/)?.[1] ??
    raw.split(".")[0] ??
    raw,
  );

  return {
    templateType: template?.templateName ?? null,
    title: title || null,
    siteName: cleanWikiMarkup(fields.journal ?? fields.work ?? fields.website ?? fields.newspaper ?? "") || null,
    publisher: cleanWikiMarkup(fields.publisher ?? "") || null,
    authors: parseAuthorList(fields),
    url: fields.url ? cleanWikiMarkup(fields.url) : url,
    doi: fields.doi ? cleanWikiMarkup(fields.doi) : doi,
    pmid: fields.pmid ? cleanWikiMarkup(fields.pmid) : pmid,
    isbn: fields.isbn ? cleanWikiMarkup(fields.isbn).replace(/[-\s]/g, "") : isbn,
    year: selectYear(fields.year ?? fields.date ?? raw),
    rawCitation: cleanWikiMarkup(raw),
  };
}

function parseRefName(attributes) {
  return String(attributes ?? "").match(/\bname\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s/>]+))/i)?.slice(1).find(Boolean) ?? null;
}

export function scanWikipediaRefs(content) {
  const text = String(content ?? "");
  const refs = [];
  let occurrenceIndex = 0;

  for (let index = 0; index < text.length;) {
    const openIndex = text.slice(index).search(/<ref\b/i);
    if (openIndex === -1) break;
    const refStart = index + openIndex;
    const tagEnd = text.indexOf(">", refStart);
    if (tagEnd === -1) break;

    const openTag = text.slice(refStart, tagEnd + 1);
    const attributes = openTag.replace(/^<ref\b/i, "").replace(/\/?>$/i, "");
    const refName = parseRefName(attributes);
    occurrenceIndex += 1;

    if (/\/\s*>$/.test(openTag)) {
      refs.push({ refName, body: "", occurrenceIndex, kind: "reuse" });
      index = tagEnd + 1;
      continue;
    }

    const closeMatch = /<\/ref\s*>/i.exec(text.slice(tagEnd + 1));
    if (!closeMatch) {
      index = tagEnd + 1;
      continue;
    }
    const bodyStart = tagEnd + 1;
    const bodyEnd = bodyStart + closeMatch.index;
    refs.push({
      refName,
      body: text.slice(bodyStart, bodyEnd),
      occurrenceIndex,
      kind: "definition",
    });
    index = bodyEnd + closeMatch[0].length;
  }

  const definitionsByName = new Map();
  for (const ref of refs) {
    if (ref.kind === "definition" && ref.refName && ref.body.trim()) {
      definitionsByName.set(ref.refName, ref.body);
    }
  }

  return refs.map((ref) => (
    ref.kind === "reuse" && ref.refName && definitionsByName.has(ref.refName)
      ? { ...ref, body: definitionsByName.get(ref.refName) }
      : ref
  ));
}

export function extractWikipediaReferenceCandidates({ sourceId, sourceName, content }) {
  const refs = scanWikipediaRefs(content);
  const candidates = [];
  const emittedSignatures = new Set();

  for (const ref of refs) {
    if (!ref.body.trim()) continue;
    const parsed = parseWikipediaCitationText(ref.body);
    const signature = JSON.stringify([
      ref.refName,
      parsed.title,
      parsed.doi,
      parsed.pmid,
      parsed.isbn,
      parsed.url,
      parsed.rawCitation,
    ]);
    if (emittedSignatures.has(signature)) continue;
    emittedSignatures.add(signature);
    candidates.push({
      ...parsed,
      sourceIds: [sourceId],
      provenance: [{
        kind: "wikipedia_reference",
        sourceId,
        sourceName,
        refName: ref.refName,
        occurrenceIndex: ref.occurrenceIndex,
      }],
    });
  }

  return candidates.slice(0, MAX_WIKIPEDIA_REFERENCE_CANDIDATES);
}

export function resolveWikipediaPageTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/wikipedia\.org$/i.test(parsed.hostname) && !/\.wikipedia\.org$/i.test(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(/^\/wiki\/(.+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]).replace(/_/g, " ");
  } catch {
    return null;
  }
}

function extractWikiSections(source) { const text = String(source ?? "");
const headingPattern = /^(={2,6})\s*(.*?)\s*\1\s*$/gm;
const headings = Array.from(text.matchAll(headingPattern));
if (headings.length === 0) {
  return [{
    heading: "Lead",
    normalizedHeading: "lead",
    level: 1,
    content: text,
    startIndex: 0,
    endIndex: text.length,
  }];
}

const sections = [];
if (headings[0].index > 0) {
  sections.push({
    heading: "Lead",
    normalizedHeading: "lead",
    level: 1,
    content: text.slice(0, headings[0].index).trim(),
    startIndex: 0,
    endIndex: headings[0].index,
  });
}

for (let index = 0; index < headings.length; index += 1) {
  const heading = headings[index];
  const next = headings[index + 1];
  const headingText = cleanWikiMarkup(heading[2]);
  const contentStart = heading.index + heading[0].length;
  const contentEnd = next?.index ?? text.length;
  sections.push({
    heading: headingText,
    normalizedHeading: normalizeHeading(headingText),
    level: heading[1].length,
    content: text.slice(contentStart, contentEnd).trim(),
    startIndex: heading.index,
    endIndex: contentEnd,
  });
}

return sections.filter((section) => section.content.trim()); }

function sectionMatchesNeedles(section, needles) {
  const haystack = `${section.normalizedHeading} ${String(section.content ?? "").toLowerCase()}`;
  return needles.some((needle) => haystack.includes(String(needle ?? "").toLowerCase()));
}

export function selectWikipediaSectionsForCitationRun({ source, sectionKey, sectionConfig }) {
  const sections = extractWikiSections(source);
  const preferredHeadings = new Set(
    (WIKIPEDIA_SECTION_HEADINGS_BY_SECTION[sectionKey] ?? []).map(normalizeHeading),
  );
  const exactMatches = sections.filter((section) => preferredHeadings.has(section.normalizedHeading));
  if (exactMatches.length > 0) {
    return exactMatches.slice(0, MAX_WIKIPEDIA_EXCERPTS_PER_SECTION);
  }

  const needles = sectionConfig?.sourceNeedles ?? [];
  const needleMatches = sections.filter((section) => sectionMatchesNeedles(section, needles));
  if (needleMatches.length > 0) {
    return needleMatches.slice(0, MAX_WIKIPEDIA_EXCERPTS_PER_SECTION);
  }

  return sections.slice(0, 1);
}

export function buildWikipediaCitationExcerpts({ source, sectionKey, sectionConfig }) {
  return selectWikipediaSectionsForCitationRun({ source, sectionKey, sectionConfig })
    .map((section, index) => ({
      sourceId: "wikipedia",
      sourceName: "Wikipedia",
      excerptId: `wikipedia:${sectionKey}:${index + 1}`,
      heading: section.heading,
      excerpt: clipText(section.content, MAX_WIKIPEDIA_EXCERPT_CHARS).trim(),
      note: WIKIPEDIA_DISCOVERY_INSTRUCTION,
    }))
    .filter((entry) => entry.excerpt);
}

export async function fetchWikipediaPageSource({ title, fetchImpl = globalThis.fetch }) {
  if (!title) throw new Error("Wikipedia page title is required");
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl is required for Wikipedia source loading");

  const url = `https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": WIKIPEDIA_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const page = await response.json();

  return {
    sourceId: "wikipedia",
    sourceName: "Wikipedia",
    pageTitle: page.title ?? title,
    pageKey: page.key ?? String(title).replace(/\s+/g, "_"),
    pageUrl: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/\s+/g, "_"))}`,
    revisionId: page.latest?.id ?? page.revision ?? null,
    revisionTimestamp: page.latest?.timestamp ?? null,
    source: page.source ?? "",
    fetchedAt: nowIso(),
    sourceOrigin: "mediawiki_rest",
  };
}

function findWikipediaTitleFromArticle(article) {
  for (const reference of article?.references ?? []) {
    const title = resolveWikipediaPageTitleFromUrl(reference?.url);
    if (title) return { title, url: reference.url };
  }
  return null;
}

function findWikipediaTitleFromSources(articleSources, source) {
  const values = [
    source?.url,
    source?.sourceUrl,
    source?.metadata?.url,
    source?.metadata?.sourceUrl,
    source?.fileName,
  ];
  for (const value of values) {
    const title = resolveWikipediaPageTitleFromUrl(value);
    if (title) return { title, url: value };
  }
  for (const entry of articleSources?.sources ?? []) {
    const title = resolveWikipediaPageTitleFromUrl(entry?.url ?? entry?.metadata?.url ?? entry?.fileName);
    if (title) return { title, url: entry.url ?? entry?.metadata?.url ?? entry?.fileName };
  }
  return null;
}

export async function loadWikipediaSourceForArticle({
  article,
  articleSources,
  source,
  fetchImpl = globalThis.fetch,
}) {
  const sourceId = source?.id ?? "wikipedia";
  const storedSource = articleSources?.contents?.[sourceId] ?? articleSources?.contents?.wikipedia ?? "";
  if (typeof storedSource === "string" && storedSource.includes("<ref")) {
    const resolved = findWikipediaTitleFromArticle(article) ?? findWikipediaTitleFromSources(articleSources, source);
    return {
      document: {
        sourceId: "wikipedia",
        sourceName: source?.displayName ?? "Wikipedia",
        pageTitle: resolved?.title ?? source?.displayName ?? article?.title ?? "Wikipedia",
        pageKey: String(resolved?.title ?? source?.displayName ?? article?.title ?? "wikipedia").replace(/\s+/g, "_"),
        pageUrl: resolved?.url ?? null,
        revisionId: null,
        revisionTimestamp: null,
        source: storedSource,
        fetchedAt: nowIso(),
        sourceOrigin: "postgres",
      },
      diagnostics: [],
    };
  }

  const resolved = findWikipediaTitleFromArticle(article) ?? findWikipediaTitleFromSources(articleSources, source);
  if (!resolved?.title) {
    return {
      document: null,
      diagnostics: [{
        kind: "wikipedia_enrichment_skipped",
        reason: "No Wikipedia page URL or title could be resolved.",
      }],
    };
  }

  try {
    const document = await fetchWikipediaPageSource({
      title: resolved.title,
      fetchImpl,
    });
    return { document, diagnostics: [] };
  } catch (error) {
    return {
      document: null,
      diagnostics: [{
        kind: "wikipedia_enrichment_fetch_failed",
        reason: error?.message ?? String(error),
        pageTitle: resolved.title,
      }],
    };
  }
}

export function buildWikipediaCitationPacket({
  document,
  references,
  excerpts,
  excerpt,
  diagnostics = [],
}) {
  if (!document) {
    return {
      enabled: true,
      status: "unavailable",
      diagnostics,
      page: null,
      excerpts: [],
      references: [],
    };
  }

  return {
    enabled: true,
    status: references?.length ? "ready" : "no_references_found",
    diagnostics,
    page: {
      title: document.pageTitle,
      url: document.pageUrl,
      revisionId: document.revisionId,
      revisionTimestamp: document.revisionTimestamp,
      sourceOrigin: document.sourceOrigin,
      fetchedAt: document.fetchedAt,
    },
    excerpts: Array.isArray(excerpts) && excerpts.length > 0
      ? excerpts
      : [{
          sourceId: "wikipedia",
          sourceName: "Wikipedia",
          excerpt: String(excerpt ?? "").trim(),
          note: WIKIPEDIA_DISCOVERY_INSTRUCTION,
        }].filter((entry) => entry.excerpt),
    references: references ?? [],
  };
}
