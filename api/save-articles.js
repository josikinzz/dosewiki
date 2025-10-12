import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { verifyCredentials } from "./_utils/passwords";

const REPO_OWNER = "josikinzz";
const REPO_NAME = "dosewiki";
const TARGET_BRANCH = "main";
const ARTICLES_PATH = "src/data/articles.json";
const CHANGE_LOG_PATH = "src/data/devChangeLog.json";
const USER_AGENT = "dose.wiki-dev-editor";
const CHANGE_LOG_LIMIT = 250;
const API_BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const COMMIT_AUTHOR = {
  name: "dose.wiki Dev Editor",
  email: "dev-editor@dose.wiki",
};

const parseBody = (rawBody) => {
  if (rawBody == null) {
    return {};
  }

  if (typeof rawBody === "string" && rawBody.trim().length > 0) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }

  if (typeof rawBody === "object") {
    return rawBody;
  }

  return {};
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

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

const githubRequest = async (token, path, options = {}) => {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    ...(options.headers ?? {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
};

const loadChangeLogEntries = async (token) => {
  const encodedPath = CHANGE_LOG_PATH.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const { response, payload } = await githubRequest(token, `/contents/${encodedPath}?ref=${TARGET_BRANCH}`);

  if (response.status === 404) {
    return { entries: [], sha: null };
  }

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to load change log file.");
  }

  try {
    const encoding = payload?.encoding === "base64" ? "base64" : "utf8";
    const buffer = Buffer.from(payload?.content ?? "", encoding);
    const text = buffer.toString("utf8");
    const parsed = JSON.parse(text);

    return {
      entries: Array.isArray(parsed) ? parsed : [],
      sha: typeof payload?.sha === "string" ? payload.sha : null,
    };
  } catch (error) {
    throw new Error(`Unable to parse devChangeLog.json: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const getRepositoryState = async (token) => {
  const { response: refResponse, payload: refPayload } = await githubRequest(
    token,
    `/git/ref/heads/${TARGET_BRANCH}`,
  );

  if (!refResponse.ok) {
    throw new Error(refPayload?.message ?? "Unable to load repository reference.");
  }

  const parentSha = refPayload?.object?.sha;
  if (!isNonEmptyString(parentSha)) {
    throw new Error("Repository reference is missing a commit SHA.");
  }

  const { response: commitResponse, payload: commitPayload } = await githubRequest(
    token,
    `/git/commits/${parentSha}`,
  );

  if (!commitResponse.ok) {
    throw new Error(commitPayload?.message ?? "Unable to load parent commit.");
  }

  const baseTreeSha = commitPayload?.tree?.sha;
  if (!isNonEmptyString(baseTreeSha)) {
    throw new Error("Parent commit is missing tree metadata.");
  }

  return {
    parentSha,
    baseTreeSha,
  };
};

const createBlob = async (token, content) => {
  const { response, payload } = await githubRequest(token, "/git/blobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, encoding: "utf-8" }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create blob.");
  }

  if (!isNonEmptyString(payload?.sha)) {
    throw new Error("GitHub did not return a blob SHA.");
  }

  return payload.sha;
};

const createTree = async (token, baseTreeSha, entries) => {
  const { response, payload } = await githubRequest(token, "/git/trees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: entries,
    }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create git tree.");
  }

  if (!isNonEmptyString(payload?.sha)) {
    throw new Error("GitHub did not return a tree SHA.");
  }

  return payload.sha;
};

const createCommit = async (token, message, treeSha, parentSha, isoTimestamp) => {
  const author = {
    ...COMMIT_AUTHOR,
    date: isoTimestamp,
  };

  const { response, payload } = await githubRequest(token, "/git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
      author,
      committer: author,
    }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to create commit.");
  }

  if (!isNonEmptyString(payload?.sha)) {
    throw new Error("GitHub did not return a commit SHA.");
  }

  return payload.sha;
};

const updateReference = async (token, commitSha) => {
  const { response, payload } = await githubRequest(token, `/git/refs/heads/${TARGET_BRANCH}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commitSha, force: false }),
  });

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to update repository reference.");
  }
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

  const changelogMarkdown = typeof body.changelogMarkdown === "string" ? body.changelogMarkdown.trim() : "";
  if (!changelogMarkdown) {
    return res.status(422).json({ error: "changelogMarkdown is required." });
  }

  const changedArticles = normalizeChangedArticles(body.changedArticles);
  if (changedArticles.length === 0) {
    return res.status(422).json({ error: "changedArticles payload must include at least one entry." });
  }

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
      articles: changedArticles,
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

    const treeSha = await createTree(githubToken, baseTreeSha, treeEntries);
    const commitSha = await createCommit(githubToken, commitMessage, treeSha, parentSha, isoTimestamp);
    await updateReference(githubToken, commitSha);

    const commitUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${commitSha}`;

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
