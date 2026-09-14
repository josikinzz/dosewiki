const DEFAULT_SNIPPET_RADIUS = 54;
const DEFAULT_VALUE_LIMIT = 360;

const PUBLIC_PROSE_ROOTS = Object.freeze([
  "summary",
  "comparisons",
  "pharmacology",
  "tolerance",
  "dosage",
  "duration",
  "harm_potential",
  "history_culture",
  "legality",
])

const ARTIFACT_LANGUAGE_PATTERNS = Object.freeze([
  {
    id: "the_quote",
    label: "the quote",
    pattern: /\bthe\s+quote(?:s)?\b/iu,
  },
  {
    id: "quote_content",
    label: "quote content",
    pattern: /\bquote(?:\s*|[_-]+)content\b/iu,
  },
  {
    id: "quote_says",
    label: "quote says/states",
    pattern: /\b(?:the\s+)?quote(?:s)?\s+(?:says?|states?|stated|mentions?|notes?)\b/iu,
  },
  {
    id: "source_material",
    label: "source material",
    pattern: /\b(?:(?:the|this|that|provided|given|extracted|available|above|cited|quoted)\s+source\s+material|source\s+material\s+(?:states?|says?|stated|indicates?|notes?|mentions?|reports?|describes?|lists?|shows?|contains?|places?))\b/iu,
  },
  {
    id: "source_text",
    label: "source text/excerpt",
    pattern: /\bsource\s+(?:text|excerpt)\b/iu,
  },
  {
    id: "source_states",
    label: "unqualified source attribution",
    pattern: /\b(?:sources?\s+conflicts?|(?:(?:the|this|that|one|another|available|cited|quoted|provided|extracted)|a(?:\s+[\p{L}\p{N}/-]+){0,4}|an(?:\s+[\p{L}\p{N}/-]+){0,4})\s+sources?\s+(?:state|states|stated|says?|said|reports?|reported|indicates?|indicated|lists?|listed|notes?|noted|describes?|described|mentions?|mentioned|identifies?|identified|places?|placed|advises?|advised|warns?|warned)|(?:some|several|multiple|other)\s+sources?\s+(?:reports?|reported|states?|stated|indicates?|indicated|lists?|listed|notes?|noted|describes?|described|mentions?|mentioned|identifies?|identified|places?|placed|advises?|advised|warns?|warned))\b/iu,
  },
  {
    id: "provided_source",
    label: "provided source material",
    pattern: /\bprovided\s+(?:quote(?:s)?|source(?:s)?|source\s+material)\b/iu,
  },
  {
    id: "extracted_source",
    label: "extracted quote/source",
    pattern: /\bextracted\s+(?:quote(?:s)?|source\s+material|source\s+text|information)\b/iu,
  },
  {
    id: "based_on_artifact",
    label: "based on quote/source material",
    pattern: /\bbased\s+on\s+(?:the\s+)?(?:quote(?:s)?|source\s+material|provided\s+source(?:s)?)\b/iu,
  },
  {
    id: "according_to_artifact",
    label: "according to quote/source material",
    pattern: /\baccording\s+to\s+(?:the\s+)?(?:quote(?:s)?|source\s+material|provided\s+source(?:s)?)\b/iu,
  },
])

const NAMED_SOURCE_NAME_PATTERN = String.raw`(?:TripSit(?:\s+Factsheets?)?|Psychonaut\s*Wiki|PsychonautWiki|PsychWiki|Erowid|DrugBank|Wikipedia|Wikimedia|PubChem|ChEMBL|DailyMed|Drugs\.com|Drugs[-\s]Forum|Bluelight|DMT[-\s]?Nexus|PiHKAL|TiHKAL|ChemSpider|Wikidata|PubMed|NCBI|PMC|NIST|Isomer\s*Design|Safer\s*Party|Disregard\s+Everything\s+I\s+Say|DEIS|Drug\s+Users\s+Bible|DUB|The\s+Drug\s+Classroom|Drug\s+Classroom|DrugClass|D\.?\s*M\.?\s*Turner|Nervewing|ProtestKit|DanceSafe|Reddit)`;
const NAMED_SOURCE_DESCRIPTOR_PATTERN = String.raw`(?:article|page|entry|database|monograph|profile|listing|label|excerpt|vault|wiki|data|record|factsheets?|fact\s+sheets?|experience\s+reports?|drug\s+profile|dosage\s+chart|combination(?:s)?\s+(?:guide|chart))`;
const OPTIONAL_ATTRIBUTION_ADVERB_PATTERN = String.raw`(?:(?:also|specifically|explicitly|generally|currently|typically|formally)\s+)?`;
const ATTRIBUTION_VERB_PATTERN = String.raw`(?:state|states|stated|says?|said|reports?|reported|indicates?|indicated|lists?|listed|notes?|noted|describes?|described|mentions?|mentioned|identifies?|identified|records?|recorded|provides?|provided|gives?|gave|classifies?|classified|categorizes?|categorized|labels?|labeled|calls?|called|warns?|warned|advises?|advised|suggests?|suggested|estimates?|estimated)`;
const PASSIVE_ATTRIBUTION_VERB_PATTERN = String.raw`(?:listed|noted|reported|described|mentioned|identified|recorded|provided|given|classified|categorized|labeled|called|estimated|suggested)`;

const NAMED_SOURCE_ATTRIBUTION_PATTERNS = Object.freeze([
  {
    id: "named_source_subject_attribution",
    label: "named source attribution",
    pattern: new RegExp(
      String.raw`\b${NAMED_SOURCE_NAME_PATTERN}(?:\s+${NAMED_SOURCE_DESCRIPTOR_PATTERN})?\s+${OPTIONAL_ATTRIBUTION_ADVERB_PATTERN}${ATTRIBUTION_VERB_PATTERN}\b`,
      "iu",
    ),
  },
  {
    id: "named_source_entry_attribution",
    label: "named source entry attribution",
    pattern: new RegExp(
      String.raw`\b(?:the\s+)?${NAMED_SOURCE_NAME_PATTERN}\s+${NAMED_SOURCE_DESCRIPTOR_PATTERN}\s+${OPTIONAL_ATTRIBUTION_ADVERB_PATTERN}${ATTRIBUTION_VERB_PATTERN}\b`,
      "iu",
    ),
  },
  {
    id: "according_to_named_source",
    label: "according to named source",
    pattern: new RegExp(
      String.raw`\baccording\s+to\s+(?:the\s+)?${NAMED_SOURCE_NAME_PATTERN}(?:\s+${NAMED_SOURCE_DESCRIPTOR_PATTERN})?\b`,
      "iu",
    ),
  },
  {
    id: "passive_named_source_attribution",
    label: "passive named source attribution",
    pattern: new RegExp(
      String.raw`\b${PASSIVE_ATTRIBUTION_VERB_PATTERN}\s+(?:by|in|on|from)\s+(?:the\s+)?${NAMED_SOURCE_NAME_PATTERN}(?:\s+${NAMED_SOURCE_DESCRIPTOR_PATTERN})?\b`,
      "iu",
    ),
  },
])

const ARTICLE_ARRAY_KEYS = [
  "articles",
  "substances",
  "substanceIndex",
  "substance_index",
  "documents",
  "records",
  "items",
];

const PROPOSAL_ARRAY_KEYS = [
  "proposals",
  "results",
  "rewrites",
];

class PublicProseArtifactLanguageError extends Error { constructor(report, options = {}) {
  super(formatArtifactLanguageFindings(report.findings, options));
  this.name = "PublicProseArtifactLanguageError";
  this.report = report;
  this.findings = report.findings;
} }

class PublicProseNamedSourceAttributionError extends Error { constructor(report, options = {}) {
  super(formatNamedSourceAttributionFindings(report.findings, options));
  this.name = "PublicProseNamedSourceAttributionError";
  this.report = report;
  this.findings = report.findings;
} }

export function auditPublicProseArtifactLanguage(input, options = {}) {
  const patterns = resolveLanguagePatterns(options);
  const records = extractAuditRecords(input, options);
  const findings = [];
  let scannedFieldCount = 0;

  for (const record of records) {
    const fields = record.kind === "field"
      ? [record]
      : extractPublicProseFields(record.article, {
          sections: record.sections ?? options.sections,
        }).map((field) => ({
          ...field,
          slug: record.slug,
          title: record.title,
          sourcePath: record.sourcePath,
          recordKind: record.kind,
        }));

    for (const field of fields) {
      if (!sectionAllowed(field.fieldPath, options.sections)) {
        continue;
      }
      scannedFieldCount += 1;
      findings.push(...findPublicProseLanguageMatches(field, patterns));
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    mode: options.mode ?? "artifact",
    sourcePath: options.sourcePath ?? null,
    scannedRecordCount: records.length,
    scannedFieldCount,
    findingCount: findings.length,
    findings,
  };
}

export function auditPublicProseNamedSourceAttribution(input, options = {}) {
  return auditPublicProseArtifactLanguage(input, {
    ...options,
    mode: "named-source",
  });
}

export function assertNoPublicProseArtifactLanguage(input, options = {}) {
  const report = auditPublicProseArtifactLanguage(input, options);
  if (report.findings.length > 0) {
    throw new PublicProseArtifactLanguageError(report, options);
  }
  return report;
}

export function assertNoPublicProseNamedSourceAttribution(input, options = {}) {
  const report = auditPublicProseNamedSourceAttribution(input, options);
  if (report.findings.length > 0) {
    throw new PublicProseNamedSourceAttributionError(report, options);
  }
  return report;
}

export function extractPublicProseFields(article, options = {}) {
  const fields = [];
  if (!isRecord(article)) return fields;

  for (const root of PUBLIC_PROSE_ROOTS) {
    if (!sectionAllowed(root, options.sections)) {
      continue;
    }
    if (!(root in article)) {
      continue;
    }
    collectStringFields(article[root], root, fields);
  }

  return fields;
}

function extractAuditRecords(input, options = {}) { return extractRecordsFromValue(input, {
  sourcePath: options.sourcePath ?? null,
  fallbackSlug: options.slug ?? null,
  fallbackTitle: options.title ?? null,
  sections: options.sections,
}); }

export function formatArtifactLanguageFindings(findings, options = {}) {
  return formatPublicProseLanguageFindings(findings, {
    ...options,
    auditLabel: "artifact-language",
  });
}

export function formatNamedSourceAttributionFindings(findings, options = {}) {
  return formatPublicProseLanguageFindings(findings, {
    ...options,
    auditLabel: "named-source attribution",
  });
}

function formatPublicProseLanguageFindings(findings, options = {}) {
  const limit = options.limit ?? 20;
  const lines = [
    `Public prose ${options.auditLabel ?? "language"} audit failed: ${findings.length} finding(s).`,
  ];

  for (const finding of findings.slice(0, limit)) {
    const source = finding.sourcePath ? `${finding.sourcePath}: ` : "";
    lines.push(`- ${source}${finding.slug} ${finding.field}`);
    lines.push(`  match: ${JSON.stringify(finding.match)} (${finding.patternId})`);
    lines.push(`  snippet: ${JSON.stringify(finding.snippet)}`);
    lines.push(`  value: ${JSON.stringify(truncateForReport(finding.value, DEFAULT_VALUE_LIMIT))}`);
  }

  if (findings.length > limit) {
    lines.push(`... ${findings.length - limit} additional finding(s) omitted.`);
  }

  return lines.join("\n");
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractRecordsFromValue(value, context) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      extractRecordsFromValue(entry, {
        ...context,
        sourcePath: appendSourceIndex(context.sourcePath, index),
      }),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const nestedRecords = extractKnownContainerRecords(value, context);
  if (nestedRecords.length > 0) {
    return nestedRecords;
  }

  const fieldRecord = extractFieldRecord(value, context);
  if (fieldRecord) {
    return [fieldRecord];
  }

  if (looksLikeArticleRecord(value)) {
    return [createArticleRecord(value, context)];
  }

  return Object.entries(value).flatMap(([key, entry]) =>
    extractRecordsFromValue(entry, {
      ...context,
      sourcePath: appendSourcePath(context.sourcePath, key),
    }),
  );
}

function extractKnownContainerRecords(value, context) {
  const records = [];

  for (const key of ARTICLE_ARRAY_KEYS) {
    if (Array.isArray(value[key])) {
      records.push(
        ...value[key].flatMap((entry, index) =>
          extractRecordsFromValue(entry, {
            ...context,
            sourcePath: appendSourcePath(context.sourcePath, `${key}[${index}]`),
          }),
        ),
      );
    }
  }

  for (const key of PROPOSAL_ARRAY_KEYS) {
    if (Array.isArray(value[key])) {
      records.push(
        ...value[key].flatMap((entry, index) =>
          extractRecordsFromValue(entry, {
            ...context,
            sourcePath: appendSourcePath(context.sourcePath, `${key}[${index}]`),
          }),
        ),
      );
    }
  }

  if (Array.isArray(value.changes)) {
    records.push(...extractApplySummaryChangeRecords(value, context));
  }

  return records;
}

function extractApplySummaryChangeRecords(value, context) {
  const records = [];
  for (const [articleIndex, articleChange] of value.changes.entries()) {
    if (!isRecord(articleChange) || !Array.isArray(articleChange.changes)) {
      continue;
    }
    for (const [changeIndex, change] of articleChange.changes.entries()) {
      if (!isRecord(change) || typeof change.after !== "string") {
        continue;
      }
      records.push(createFieldRecord({
        slug: articleChange.slug,
        title: articleChange.title,
        fieldPath: change.fieldPath,
        replacementValue: change.after,
      }, {
        ...context,
        sourcePath: appendSourcePath(context.sourcePath, `changes[${articleIndex}].changes[${changeIndex}]`),
      }));
    }
  }
  return records.filter(Boolean);
}

function extractFieldRecord(value, context) {
  const fieldPath = typeof value.fieldPath === "string"
    ? value.fieldPath
    : typeof value.field === "string"
      ? value.field
      : null;
  if (!fieldPath || !sectionAllowed(fieldPath, context.sections)) {
    return null;
  }

  const replacementValue = getReplacementValue(value);
  if (typeof replacementValue !== "string") {
    return null;
  }

  return createFieldRecord({
    slug: value.slug ?? value.articleSlug ?? value.substanceSlug,
    title: value.title ?? value.articleTitle,
    fieldPath,
    replacementValue,
  }, context);
}

function createFieldRecord(value, context) {
  if (!value || typeof value.replacementValue !== "string") {
    return null;
  }

  const title = value.title ?? context.fallbackTitle ?? null;
  const slug = value.slug ?? context.fallbackSlug ?? slugify(title) ?? "unknown";
  return {
    kind: "field",
    slug: slug || "unknown",
    title,
    fieldPath: value.fieldPath,
    field: value.fieldPath,
    value: value.replacementValue,
    sourcePath: context.sourcePath,
    recordKind: "field",
  };
}

function createArticleRecord(article, context) {
  const title = article.title ?? context.fallbackTitle ?? null;
  const slug = article.slug ?? article.articleSlug ?? context.fallbackSlug ?? slugify(title) ?? "unknown";
  return {
    kind: "article",
    slug: slug || "unknown",
    title,
    article,
    sourcePath: context.sourcePath,
    sections: context.sections,
  };
}

function getReplacementValue(value) {
  if (typeof value.replacementValue === "string") return value.replacementValue;
  if (typeof value.rewrittenText === "string") return value.rewrittenText;
  if (typeof value.after === "string") return value.after;
  if (typeof value.value === "string") return value.value;
  if (typeof value.originalValue === "string") return value.originalValue;
  if (typeof value.response?.parsed?.rewrittenText === "string") {
    return value.response.parsed.rewrittenText;
  }
  return null;
}

function looksLikeArticleRecord(value) {
  if (!isRecord(value)) return false;
  if (!value.slug && !value.articleSlug && !value.title) return false;
  const publicRoots = PUBLIC_PROSE_ROOTS.filter((root) => root in value);
  if (publicRoots.length === 0) return false;
  return publicRoots.some((root) => !isSectionWorklistBucket(value[root]));
}

function isSectionWorklistBucket(value) {
  return isRecord(value) && Array.isArray(value.entries);
}

function collectStringFields(value, path, fields) {
  if (typeof value === "string") {
    if (value.trim().length > 0) {
      fields.push({
        fieldPath: path,
        field: path,
        value,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      collectStringFields(entry, `${path}[${index}]`, fields);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    collectStringFields(entry, appendFieldPath(path, key), fields);
  }
}

function resolveLanguagePatterns(options) {
  if (Array.isArray(options.patterns)) {
    return options.patterns;
  }
  if (options.mode === "named-source") {
    return NAMED_SOURCE_ATTRIBUTION_PATTERNS;
  }
  if (options.mode === "all") {
    return [...ARTIFACT_LANGUAGE_PATTERNS, ...NAMED_SOURCE_ATTRIBUTION_PATTERNS];
  }
  if (options.mode && options.mode !== "artifact") {
    throw new Error(`Unsupported public prose audit mode: ${options.mode}`);
  }
  return ARTIFACT_LANGUAGE_PATTERNS;
}

function findPublicProseLanguageMatches(field, patterns) {
  const value = String(field.value ?? "");
  const candidates = [];

  for (const [patternIndex, patternDef] of patterns.entries()) {
    const regex = toGlobalRegex(patternDef.pattern);
    for (const match of value.matchAll(regex)) {
      const start = match.index ?? 0;
      candidates.push({
        slug: field.slug ?? "unknown",
        title: field.title ?? null,
        field: field.fieldPath ?? field.field ?? "unknown",
        value,
        snippet: buildSnippet(value, start, match[0].length),
        match: match[0],
        patternId: patternDef.id,
        patternLabel: patternDef.label,
        sourcePath: field.sourcePath ?? null,
        recordKind: field.recordKind ?? null,
        start,
        end: start + match[0].length,
        patternIndex,
      });
    }
  }

  return pickNonOverlappingMatches(candidates).map(({
    start: _start,
    end: _end,
    patternIndex: _patternIndex,
    ...finding
  }) => finding);
}

function pickNonOverlappingMatches(candidates) {
  const selected = [];
  for (const candidate of candidates.sort(compareMatchCandidates)) {
    if (selected.some((existing) => rangesOverlap(candidate, existing))) {
      continue;
    }
    selected.push(candidate);
  }

  return selected.sort((a, b) => a.start - b.start || a.patternIndex - b.patternIndex);
}

function compareMatchCandidates(a, b) {
  return a.start - b.start ||
    (b.end - b.start) - (a.end - a.start) ||
    a.patternIndex - b.patternIndex;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function buildSnippet(value, start, length) {
  const from = Math.max(0, start - DEFAULT_SNIPPET_RADIUS);
  const to = Math.min(value.length, start + length + DEFAULT_SNIPPET_RADIUS);
  const prefix = from > 0 ? "..." : "";
  const suffix = to < value.length ? "..." : "";
  return `${prefix}${value.slice(from, to)}${suffix}`.replace(/\s+/g, " ").trim();
}

function toGlobalRegex(regex) {
  const flags = new Set(regex.flags.split(""));
  flags.add("g");
  return new RegExp(regex.source, [...flags].join(""));
}

function sectionAllowed(fieldPath, sections) {
  if (!sections || sections.length === 0) return true;
  const allowed = new Set(sections);
  const root = String(fieldPath ?? "").split(/[.[\]]/, 1)[0];
  return allowed.has(root) || allowed.has(fieldPath);
}

function appendFieldPath(base, key) {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `${base}.${key}`;
  }
  return `${base}[${JSON.stringify(key)}]`;
}

function appendSourcePath(base, suffix) {
  return base ? `${base}.${suffix}` : suffix;
}

function appendSourceIndex(base, index) {
  return base ? `${base}[${index}]` : `[${index}]`;
}

function truncateForReport(value, limit) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3)}...`;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
