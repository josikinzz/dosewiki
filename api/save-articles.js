import { Buffer } from "node:buffer";

const REPO_OWNER = "josikinzz";
const REPO_NAME = "dosewiki";
const TARGET_PATH = "src/data/articles.json";
const TARGET_BRANCH = "main";
const USER_AGENT = "dose.wiki-dev-editor";

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

const buildContentUrl = () => {
  const encodedPath = TARGET_PATH.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${TARGET_BRANCH}`;
};

const fetchFromGitHub = async (url, options, token) => {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    ...(options?.headers ?? {}),
  };

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!adminPassword || !githubToken) {
    return res.status(500).json({ error: "Required environment variables are missing." });
  }

  const body = parseBody(req.body);
  const providedPassword = typeof body.password === "string" ? body.password : "";
  if (providedPassword !== adminPassword) {
    return res.status(401).json({ error: "Invalid password." });
  }

  if (body.articlesData === undefined) {
    return res.status(400).json({ error: "articlesData payload is required." });
  }

  const commitMessage =
    typeof body.commitMessage === "string" && body.commitMessage.trim().length > 0
      ? body.commitMessage.trim()
      : `Update articles.json via dev editor - ${new Date().toISOString()}`;

  const contentUrl = buildContentUrl();
  const { response: fetchResponse, payload: fetchPayload } = await fetchFromGitHub(contentUrl, {}, githubToken);

  if (!fetchResponse.ok) {
    return res.status(500).json({ error: "Failed to load articles.json.", details: fetchPayload?.message ?? null });
  }

  const existingSha = typeof fetchPayload?.sha === "string" ? fetchPayload.sha : null;
  if (!existingSha) {
    return res.status(500).json({ error: "Unable to determine current file SHA." });
  }

  const serialized = JSON.stringify(body.articlesData, null, 2);
  const encodedContent = Buffer.from(serialized, "utf8").toString("base64");

  const updateUrl = contentUrl.replace(`?ref=${TARGET_BRANCH}`, "");
  const { response: updateResponse, payload: updatePayload } = await fetchFromGitHub(
    updateUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        content: encodedContent,
        sha: existingSha,
        branch: TARGET_BRANCH,
      }),
    },
    githubToken,
  );

  if (!updateResponse.ok) {
    return res.status(500).json({ error: "Failed to save articles.json.", details: updatePayload?.message ?? null });
  }

  const commitSha = updatePayload?.commit?.sha ?? null;
  const commitUrl = updatePayload?.commit?.html_url ?? null;

  return res.status(200).json({ success: true, commitSha, commitUrl });
}
