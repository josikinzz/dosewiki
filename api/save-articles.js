import { randomUUID } from "node:crypto";

import { verifyCredentials } from "./_utils/passwords.js";
import { parseBody } from "./_utils/parseBody.js";
import {
  TARGET_BRANCH,
  buildCommitUrl,
  createBlob,
  createCommit,
  createTree,
  getRepositoryState,
  loadFileFromRepo,
  updateReference,
} from "./_utils/github.js";

const ARTICLES_PATH = "src/data/articles.json";
const CHANGE_LOG_PATH = "src/data/devChangeLog.json";
const PSYCHOACTIVE_INDEX_PATH = "src/data/psychoactiveIndexManual.json";
const ABOUT_MARKDOWN_PATH = "src/data/aboutContent.md";
const ABOUT_SUBTITLE_PATH = "src/data/aboutSubtitle.md";
const ABOUT_CONFIG_PATH = "src/data/aboutConfig.json";
const GENERATOR_PROMPT_PATH = "src/data/article-sources/prompt.md";
const CHANGE_LOG_LIMIT = 250;

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

  const normalized = value.replace(/
/g, "\n").trim();
  return `${normalized}
`;
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    return res.status(500).json({ error: "Required environment variables are missing." });
  }

  const body = parseBody(req.body);
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (trimmedUsername.length === 0 || trimmedPassword.length === 0) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const isValid = verifyCredentials(trimmedUsername, trimmedPassword);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const passwordKey = trimmedUsername;

  if (body.articlesData === undefined) {
    return res.status(400).json({ error: "articlesData payload is required." });
  }

  const manualData = body.psychoactiveIndexManualData;
  let serializedManual = null;
  if (manualData !== undefined) {
    if (typeof manualData !== "object" || manualData === null) {
      return res.status(400).json({ error: "psychoactiveIndexManualData must be an object when provided." });
    }
    try {
      serializedManual = JSON.stringify(manualData, null, 2);
    } catch (error) {
      return res
        .status(400)
        .json({ error: `Unable to serialize psychoactiveIndexManualData: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  let normalizedAboutMarkdown = null;
  if (Object.prototype.hasOwnProperty.call(body, 'aboutMarkdown')) {
    if (typeof body.aboutMarkdown !== "string") {
      return res.status(400).json({ error: "aboutMarkdown must be a string when provided." });
    }
    normalizedAboutMarkdown = normalizeAboutMarkdown(body.aboutMarkdown);
  }

  let normalizedAboutSubtitle = null;
  if (Object.prototype.hasOwnProperty.call(body, 'aboutSubtitleMarkdown')) {
    if (typeof body.aboutSubtitleMarkdown !== "string") {
      return res.status(400).json({ error: "aboutSubtitleMarkdown must be a string when provided." });
    }
    normalizedAboutSubtitle = normalizeAboutMarkdown(body.aboutSubtitleMarkdown);
  }

  let serializedAboutConfig = null;
  if (Object.prototype.hasOwnProperty.call(body, 'aboutConfig')) {
    if (typeof body.aboutConfig !== "object" || body.aboutConfig === null) {
      return res.status(400).json({ error: "aboutConfig must be an object when provided." });
    }
    const normalizedAboutConfigPayload = normalizeAboutConfig(body.aboutConfig);
    serializedAboutConfig = JSON.stringify(normalizedAboutConfigPayload, null, 2);
  }

  let normalizedGeneratorPrompt = null;
  if (Object.prototype.hasOwnProperty.call(body, 'generatorPrompt')) {
    if (typeof body.generatorPrompt !== "string") {
      return res.status(400).json({ error: "generatorPrompt must be a string when provided." });
    }
    normalizedGeneratorPrompt = normalizeAboutMarkdown(body.generatorPrompt);
  }

  const rawChangelogMarkdown = typeof body.changelogMarkdown === "string" ? body.changelogMarkdown.trim() : "";
  const changelogMarkdown =
    rawChangelogMarkdown.length > 0 ? rawChangelogMarkdown : "No diff details were provided for this commit.";

  const changedArticles = normalizeChangedArticles(body.changedArticles);
  const hasChangedArticles = changedArticles.length > 0;

  const commitMessage =
    typeof body.commitMessage === "string" && body.commitMessage.trim().length > 0
      ? body.commitMessage.trim()
      : `Update articles.json via dev editor - ${new Date().toISOString()}`;

  try {
    const isoTimestamp = new Date().toISOString();
    const { entries: existingLogEntries } = await loadChangeLogEntries(githubToken);
    const serializedArticles = JSON.stringify(body.articlesData, null, 2);

    const entryId = `${formatIdTimestamp(new Date(isoTimestamp))}-${randomUUID().slice(0, 8)}`;
    const newEntry = {
      id: entryId,
      createdAt: isoTimestamp,
      commit: {
        sha: "",
        url: "",
        message: commitMessage,
      },
      articles: hasChangedArticles ? changedArticles : [],
      markdown: changelogMarkdown,
      submittedBy: passwordKey,
    };

    const updatedEntries = appendChangeLogEntry(existingLogEntries, newEntry);
    const serializedChangeLog = JSON.stringify(updatedEntries, null, 2);

    const { parentSha, baseTreeSha } = await getRepositoryState(githubToken);
    const articlesBlobSha = await createBlob(githubToken, serializedArticles);
    const changeLogBlobSha = await createBlob(githubToken, serializedChangeLog);

    const treeEntries = [
      {
        path: ARTICLES_PATH,
        mode: "100644",
        type: "blob",
        sha: articlesBlobSha,
      },
      {
        path: CHANGE_LOG_PATH,
        mode: "100644",
        type: "blob",
        sha: changeLogBlobSha,
      },
    ];

    let manualBlobSha = null;
    if (serializedManual !== null) {
      manualBlobSha = await createBlob(githubToken, serializedManual);
      treeEntries.push({
        path: PSYCHOACTIVE_INDEX_PATH,
        mode: "100644",
        type: "blob",
        sha: manualBlobSha,
      });
    }

    if (normalizedAboutMarkdown !== null) {
      const aboutMarkdownBlobSha = await createBlob(githubToken, normalizedAboutMarkdown);
      treeEntries.push({
        path: ABOUT_MARKDOWN_PATH,
        mode: "100644",
        type: "blob",
        sha: aboutMarkdownBlobSha,
      });
    }

    if (normalizedAboutSubtitle !== null) {
      const aboutSubtitleBlobSha = await createBlob(githubToken, normalizedAboutSubtitle);
      treeEntries.push({
        path: ABOUT_SUBTITLE_PATH,
        mode: "100644",
        type: "blob",
        sha: aboutSubtitleBlobSha,
      });
    }

    if (serializedAboutConfig !== null) {
      const aboutConfigBlobSha = await createBlob(githubToken, serializedAboutConfig);
      treeEntries.push({
        path: ABOUT_CONFIG_PATH,
        mode: "100644",
        type: "blob",
        sha: aboutConfigBlobSha,
      });
    }

    if (normalizedGeneratorPrompt !== null) {
      const generatorPromptBlobSha = await createBlob(githubToken, normalizedGeneratorPrompt);
      treeEntries.push({
        path: GENERATOR_PROMPT_PATH,
        mode: "100644",
        type: "blob",
        sha: generatorPromptBlobSha,
      });
    }

    const treeSha = await createTree(githubToken, baseTreeSha, treeEntries);
    const commitSha = await createCommit(githubToken, commitMessage, treeSha, parentSha, isoTimestamp);
    await updateReference(githubToken, commitSha);

    const commitUrl = buildCommitUrl(commitSha);

    return res.status(200).json({
      success: true,
      commitSha,
      commitUrl,
      createdAt: isoTimestamp,
      submittedBy: passwordKey,
      entry: {
        ...newEntry,
        commit: {
          sha: commitSha,
          url: commitUrl,
          message: commitMessage,
        },
        submittedBy: passwordKey,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error occurred.";
    return res.status(500).json({ error: message });
  }
}
