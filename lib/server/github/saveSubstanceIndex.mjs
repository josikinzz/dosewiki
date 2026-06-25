import { randomUUID } from "node:crypto";

import { createLogger } from "../logger.mjs";
import { validateArticlesPayload } from "./validation.mjs";
import {
  TARGET_BRANCH,
  loadFileFromRepo,
} from "./client.mjs";
import {
  DEFAULT_GITHUB_FILE_CHANGE_TARGET,
  applyGitHubFileChangeSet,
  createDefaultGitHubRepositoryAdapter,
} from "./fileChange.mjs";

const log = createLogger("save-substance-index");

const SUBSTANCE_INDEX_PATH = "src/data/SubstanceIndex.json";
const CHANGE_LOG_PATH = "src/data/changelog/devChangeLog.json";
const PSYCHOACTIVE_INDEX_PATH = "src/data/indexes/psychoactiveIndexManual.json";
const ABOUT_MARKDOWN_PATH = "src/data/content/aboutContent.md";
const ABOUT_SUBTITLE_PATH = "src/data/content/aboutSubtitle.md";
const ABOUT_CONFIG_PATH = "src/data/content/aboutConfig.json";
const GENERATOR_PROMPT_PATH = "src/data/article-sources/prompt.md";
const CHANGE_LOG_LIMIT = 250;

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

const normalizeChangedArticles = (rawArticles) => {
  if (!Array.isArray(rawArticles)) {
    return [];
  }

  return rawArticles
    .map((article) => {
      if (typeof article !== "object" || article === null) {
        return null;
      }

      const idValue = Number((article?.id ?? Number.NaN));
      const titleValue = typeof article?.title === "string" ? article.title.trim() : "";
      const slugValue = typeof article?.slug === "string" ? article.slug.trim() : "";

      if (!Number.isFinite(idValue) || !titleValue || !slugValue) {
        return null;
      }

      return {
        id: idValue,
        title: titleValue,
        slug: slugValue,
      };
    })
    .filter((entry) => entry !== null);
};

const formatIdTimestamp = (date) => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};

const appendChangeLogEntry = (entries, entry) => {
  const merged = [entry, ...entries];
  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (merged.length > CHANGE_LOG_LIMIT) {
    return merged.slice(0, CHANGE_LOG_LIMIT);
  }
  return merged;
};

const loadChangeLogEntries = async (token) => {
  const { content, sha } = await loadFileFromRepo(token, CHANGE_LOG_PATH, TARGET_BRANCH);

  if (content === null) {
    return { entries: [], sha: null };
  }

  try {
    const parsed = JSON.parse(content);
    return {
      entries: Array.isArray(parsed) ? parsed : [],
      sha,
    };
  } catch (error) {
    throw new Error(`Unable to parse devChangeLog.json: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const normalizeAboutMarkdown = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return `${normalized}\n`;
};

const normalizeFounderKeys = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const keys = [];

  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }

    const normalized = entry.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    keys.push(normalized);
  });

  return keys;
};

const normalizeAboutConfig = (value) => {
  if (!value || typeof value !== "object") {
    return { founderProfileKeys: [] };
  }

  const founderProfileKeys = normalizeFounderKeys(value.founderProfileKeys);
  return { founderProfileKeys };
};

export async function buildSubstanceIndexFileChangeSet({
  body,
  submittedBy,
  existingChangeLogEntries = [],
  timestamp = new Date(),
  entryId = `dev-${formatIdTimestamp(timestamp)}-${randomUUID().slice(0, 8)}`,
} = {}) {
  const skipArticles = body.skipArticles === true;

  if (!skipArticles && body.articlesData === undefined) {
    throw new RequestError(400, "articlesData payload is required when skipArticles is false.");
  }

  if (!skipArticles) {
    const validationResult = validateArticlesPayload(body.articlesData);
    if (!validationResult.success) {
      const issue = validationResult.error?.issues?.[0];
      const issuePath = Array.isArray(issue?.path) && issue.path.length > 0
        ? issue.path.join(".")
        : "articlesData";
      const issueMessage = typeof issue?.message === "string"
        ? issue.message
        : "Invalid article payload.";
      throw new RequestError(400, `articlesData payload is invalid: ${issuePath} ${issueMessage}`);
    }
    log.debug("Payload received - articles count:", Array.isArray(body.articlesData) ? body.articlesData.length : "not an array");
  } else {
    log.debug("skipArticles=true - articles will not be updated in GitHub");
  }

  const manualData = body.psychoactiveIndexManualData;
  let serializedManual = null;
  if (manualData !== undefined) {
    if (typeof manualData !== "object" || manualData === null) {
      throw new RequestError(400, "psychoactiveIndexManualData must be an object when provided.");
    }

    try {
      serializedManual = `${JSON.stringify(manualData, null, 2)}\n`;
    } catch (error) {
      throw new RequestError(400, `Unable to serialize psychoactiveIndexManualData: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const normalizedAboutMarkdown = body.aboutMarkdown === undefined
    ? null
    : normalizeAboutMarkdown(body.aboutMarkdown);
  if (body.aboutMarkdown !== undefined && normalizedAboutMarkdown === null) {
    throw new RequestError(400, "aboutMarkdown must be a string when provided.");
  }

  const normalizedAboutSubtitle = body.aboutSubtitleMarkdown === undefined
    ? null
    : normalizeAboutMarkdown(body.aboutSubtitleMarkdown);
  if (body.aboutSubtitleMarkdown !== undefined && normalizedAboutSubtitle === null) {
    throw new RequestError(400, "aboutSubtitleMarkdown must be a string when provided.");
  }

  let serializedAboutConfig = null;
  if (body.aboutConfig !== undefined) {
    if (typeof body.aboutConfig !== "object" || body.aboutConfig === null) {
      throw new RequestError(400, "aboutConfig must be an object when provided.");
    }

    serializedAboutConfig = `${JSON.stringify(normalizeAboutConfig(body.aboutConfig), null, 2)}\n`;
  }

  const normalizedGeneratorPrompt = body.generatorPrompt === undefined
    ? null
    : normalizeAboutMarkdown(body.generatorPrompt);
  if (body.generatorPrompt !== undefined && normalizedGeneratorPrompt === null) {
    throw new RequestError(400, "generatorPrompt must be a string when provided.");
  }

  const changedArticles = normalizeChangedArticles(body.changedArticles);
  const commitMessage = typeof body.commitMessage === "string" && body.commitMessage.trim().length > 0
    ? body.commitMessage.trim()
    : `Update substance index (${submittedBy})`;
  const changelogMarkdown = typeof body.changelogMarkdown === "string" ? body.changelogMarkdown : "";
  const isoTimestamp = timestamp.toISOString();
  const newEntry = {
    id: entryId,
    createdAt: isoTimestamp,
    commit: {
      sha: "",
      url: "",
      message: commitMessage,
    },
    markdown: changelogMarkdown,
    articles: changedArticles,
    submittedBy,
  };

  const files = [];

  if (!skipArticles) {
    const serializedArticles = `${JSON.stringify(body.articlesData, null, 2)}\n`;
    files.push({
      name: "substance-index",
      path: SUBSTANCE_INDEX_PATH,
      content: serializedArticles,
    });
  }

  const serializedChangeLog = `${JSON.stringify(appendChangeLogEntry(existingChangeLogEntries, newEntry), null, 2)}\n`;
  files.push({
    name: "dev-changelog",
    path: CHANGE_LOG_PATH,
    content: serializedChangeLog,
  });

  if (serializedManual !== null) {
    files.push({
      name: "psychoactive-index-manual",
      path: PSYCHOACTIVE_INDEX_PATH,
      content: serializedManual,
    });
  }

  if (normalizedAboutMarkdown !== null) {
    files.push({
      name: "about-markdown",
      path: ABOUT_MARKDOWN_PATH,
      content: normalizedAboutMarkdown,
    });
  }

  if (normalizedAboutSubtitle !== null) {
    files.push({
      name: "about-subtitle",
      path: ABOUT_SUBTITLE_PATH,
      content: normalizedAboutSubtitle,
    });
  }

  if (serializedAboutConfig !== null) {
    files.push({
      name: "about-config",
      path: ABOUT_CONFIG_PATH,
      content: serializedAboutConfig,
    });
  }

  if (normalizedGeneratorPrompt !== null) {
    files.push({
      name: "generator-prompt",
      path: GENERATOR_PROMPT_PATH,
      content: normalizedGeneratorPrompt,
    });
  }

  return {
    changeSet: {
      kind: "backup",
      target: DEFAULT_GITHUB_FILE_CHANGE_TARGET,
      actor: { key: submittedBy },
      message: commitMessage,
      timestamp: isoTimestamp,
      files,
    },
    entry: newEntry,
  };
}

export async function saveSubstanceIndexWithGitHub({ body, submittedBy, githubToken, repository } = {}) {
  const timestamp = new Date();
  const entryId = `dev-${formatIdTimestamp(timestamp)}-${randomUUID().slice(0, 8)}`;
  await buildSubstanceIndexFileChangeSet({
    body,
    submittedBy,
    existingChangeLogEntries: [],
    timestamp,
    entryId,
  });

  const { entries: existingChangeLogEntries } = await loadChangeLogEntries(githubToken);
  const { changeSet, entry } = await buildSubstanceIndexFileChangeSet({
    body,
    submittedBy,
    existingChangeLogEntries,
    timestamp,
    entryId,
  });

  log.debug("Applying GitHub file change set with", changeSet.files.length, "files:", changeSet.files.map((file) => file.path));
  const result = await applyGitHubFileChangeSet(changeSet, {
    repository: repository ?? createDefaultGitHubRepositoryAdapter(githubToken),
  });

  const { commitSha, commitUrl, createdAt } = result;
  log.info("SUCCESS - Commit URL:", commitUrl);

  return {
    success: true,
    commitSha,
    commitUrl,
    createdAt,
    submittedBy,
    entry: {
      ...entry,
      commit: {
        sha: commitSha,
        url: commitUrl,
        message: changeSet.message,
      },
      submittedBy,
    },
  };
}
