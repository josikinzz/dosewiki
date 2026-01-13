export default async function handler(req, res) {
  const keys = ["GITHUB_TOKEN", "ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];

  const details = {};
  keys.forEach((key) => {
    const val = process.env[key];
    details[key] = val ? `EXISTS (${val.length} chars)` : "UNDEFINED";
  });

  // Test GitHub token validity by making a simple API call
  let githubTest = null;
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    try {
      const response = await fetch("https://api.github.com/repos/josikinzz/dosewiki-admin", {
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${githubToken}`,
          "User-Agent": "dose.wiki-test",
        },
      });
      const data = await response.json();
      githubTest = {
        status: response.status,
        repoName: data.full_name || null,
        permissions: data.permissions || null,
        error: data.message || null,
      };
    } catch (error) {
      githubTest = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return res.status(200).json({
    keysFound: keys.filter((key) => typeof process.env[key] === "string" && process.env[key].length > 0).length,
    totalKeys: keys.length,
    details,
    githubTest,
    timestamp: new Date().toISOString(),
  });
}
