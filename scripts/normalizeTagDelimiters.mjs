#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const ARTICLES_PATH = join(ROOT, "src/data/articles.json");
const NOTES_DIR = join(ROOT, "notes and plans");

const FIELD_CONFIGS = [
  {
    key: "chemical_class",
    label: "Chemical Class",
    options: { splitOnComma: true, splitOnSlash: true },
  },
  {
    key: "psychoactive_class",
    label: "Psychoactive Class",
    options: { splitOnComma: true, splitOnSlash: true },
  },
  {
    key: "mechanism_of_action",
    label: "Mechanism of Action",
    options: { splitOnComma: false, splitOnSlash: true },
  },
];

const DEFAULT_TOKEN_OPTIONS = {
  splitOnSemicolon: true,
  splitOnComma: true,
  splitOnSlash: true,
  slashRequiresWhitespace: true,
};

const isWhitespace = (value) => value === " " || value === "\t";

const normalizeTagEntry = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const label = value.replace(/\s+/g, " ").trim();
  if (!label) {
    return null;
  }
  return {
    key: label.toLowerCase(),
    label,
  };
};

const ensureNormalizedTagList = (values) => {
  const seen = new Set();
  const normalized = [];
  values.forEach((value) => {
    const entry = normalizeTagEntry(value);
    if (!entry) {
      return;
    }
    if (seen.has(entry.key)) {
      return;
    }
    seen.add(entry.key);
    normalized.push(entry.label);
  });
  return normalized;
};

const shouldSplitOnComma = (source, index) => {
  const next = source[index + 1] ?? "";
  return next === " " || next === "\t";
};

const shouldSplitOnSlash = (source, index, requireWhitespace) => {
  const prev = source[index - 1] ?? "";
  const next = source[index + 1] ?? "";
  const hasLeadingWhitespace = isWhitespace(prev);
  const hasTrailingWhitespace = isWhitespace(next);

  if (!hasTrailingWhitespace) {
    return { split: false, skip: 0 };
  }

  if (requireWhitespace && !hasLeadingWhitespace) {
    return { split: false, skip: 0 };
  }

  let skip = 0;
  let cursor = index + 1;
  while (cursor < source.length && isWhitespace(source[cursor])) {
    skip += 1;
    cursor += 1;
  }

  return { split: true, skip };
};

const tokenizeTagString = (value, options = {}) => {
  if (typeof value !== "string") {
    return [];
  }

  const merged = { ...DEFAULT_TOKEN_OPTIONS, ...options };
  const normalizedSource = value.replace(/\r?\n+/g, ";");
  if (!normalizedSource.trim()) {
    return [];
  }

  const tokens = [];
  let current = "";
  let depth = 0;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      tokens.push(trimmed);
    }
    current = "";
  };

  for (let index = 0; index < normalizedSource.length; index += 1) {
    const char = normalizedSource[index];

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (depth === 0) {
      if (merged.splitOnSemicolon && char === ";") {
        flush();
        while (index + 1 < normalizedSource.length && normalizedSource[index + 1] === " ") {
          index += 1;
        }
        continue;
      }

      if (merged.splitOnComma && char === "," && shouldSplitOnComma(normalizedSource, index)) {
        flush();
        while (index + 1 < normalizedSource.length && normalizedSource[index + 1] === " ") {
          index += 1;
        }
        continue;
      }

      if (merged.splitOnSlash && char === "/") {
        const { split, skip } = shouldSplitOnSlash(
          normalizedSource,
          index,
          merged.slashRequiresWhitespace,
        );
        if (split) {
          flush();
          index += skip;
          continue;
        }
      }
    }

    current += char;
  }

  flush();

  return ensureNormalizedTagList(tokens);
};

const tokenizeFieldValue = (value, options) => {
  if (Array.isArray(value)) {
    return ensureNormalizedTagList(value.map((entry) => (typeof entry === "string" ? entry : String(entry ?? ""))));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return tokenizeTagString(String(value), options);
  }
  return tokenizeTagString(value, options);
};

const formatSample = (sample) => {
  const title = sample.title ? ` (${sample.title})` : "";
  return `- ID ${sample.id ?? "unknown"}${title}: \`${sample.before}\` → \`${sample.after}\``;
};

const createSummaryMarkdown = (summary) => {
  const lines = [];
  lines.push(`# Tag Delimiter Normalization`);
  lines.push(`- Timestamp: ${summary.timestamp}`);
  lines.push(`- Records processed: ${summary.totalRecords}`);
  lines.push(`- Articles updated: ${summary.articlesUpdated}`);
  lines.push("");
  lines.push(`## Field Breakdown`);
  FIELD_CONFIGS.forEach((config) => {
    const stats = summary.fields[config.key];
    lines.push(`### ${config.label}`);
    lines.push(`- Entries updated: ${stats.updated}`);
    lines.push(`- Unique tags before: ${stats.uniqueBefore}`);
    lines.push(`- Unique tags after: ${stats.uniqueAfter}`);
    if (stats.samples.length > 0) {
      lines.push(`- Samples:`);
      stats.samples.forEach((sample) => {
        lines.push(formatSample(sample));
      });
    }
    lines.push("");
  });
  return `${lines.join("\n")}`.trimEnd();
};

const collectUniqueTokens = (records, key, options) => {
  const tokens = new Set();
  records.forEach((article) => {
    const info = article.drug_info ?? {};
    const value = info[key];
    tokenizeFieldValue(value, options).forEach((token) => {
      tokens.add(token);
    });
  });
  return tokens.size;
};

const main = async () => {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  const raw = await readFile(ARTICLES_PATH, "utf8");
  const articles = JSON.parse(raw);

  const summary = {
    timestamp: new Date().toISOString(),
    totalRecords: articles.length,
    articlesUpdated: 0,
    fields: FIELD_CONFIGS.reduce((acc, config) => {
      acc[config.key] = { updated: 0, uniqueBefore: 0, uniqueAfter: 0, samples: [] };
      return acc;
    }, {}),
  };

  FIELD_CONFIGS.forEach((config) => {
    summary.fields[config.key].uniqueBefore = collectUniqueTokens(articles, config.key, config.options);
  });

  const mutatedArticles = [];

  articles.forEach((article, index) => {
    const info = article.drug_info;
    if (!info) {
      return;
    }

    let articleChanged = false;

    FIELD_CONFIGS.forEach((config) => {
      const original = info[config.key];
      const originalString = typeof original === "string" ? original.trim() : "";
      const tokens = tokenizeFieldValue(original, config.options);
      const nextValue = tokens.length > 0 ? tokens.join("; ") : originalString;

      if (nextValue !== originalString) {
        info[config.key] = nextValue;
        summary.fields[config.key].updated += 1;
        articleChanged = true;

        if (summary.fields[config.key].samples.length < 5) {
          summary.fields[config.key].samples.push({
            id: article.id ?? index,
            title: article.title ?? "",
            before: original ?? "",
            after: nextValue,
          });
        }
      }
    });

    if (articleChanged) {
      summary.articlesUpdated += 1;
      mutatedArticles.push(article);
    }
  });

  FIELD_CONFIGS.forEach((config) => {
    summary.fields[config.key].uniqueAfter = collectUniqueTokens(articles, config.key, config.options);
  });

  if (!isDryRun && mutatedArticles.length > 0) {
    await writeFile(ARTICLES_PATH, `${JSON.stringify(articles, null, 2)}\n`);
    await mkdir(NOTES_DIR, { recursive: true });
    const timestampSafe = summary.timestamp.replace(/[:]/g, "-");
    const summaryPath = join(NOTES_DIR, `tag-delimiter-normalization-${timestampSafe}.md`);
    const markdown = createSummaryMarkdown(summary);
    await writeFile(summaryPath, `${markdown}\n`);
    console.log(`Wrote updated dataset to ${ARTICLES_PATH}`);
    console.log(`Wrote summary to ${summaryPath}`);
  }

  console.log(`Processed ${summary.totalRecords} articles.`);
  console.log(`Updated ${summary.articlesUpdated} articles across target fields.`);
  FIELD_CONFIGS.forEach((config) => {
    const stats = summary.fields[config.key];
    console.log(`- ${config.label}: ${stats.updated} entries updated`);
  });

  if (isDryRun) {
    console.log("Dry run complete. No files were modified.");
  }
};

main().catch((error) => {
  console.error("Failed to normalize tag delimiters:", error);
  process.exitCode = 1;
});
