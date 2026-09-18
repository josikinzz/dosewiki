const DEFAULT_SCRY_QUERY_URL = "https://api.scry.io/v1/scry/query";

export function getScryApiKey(env = process.env) {
  const value = env.SCRY_API_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getScryQueryUrl(env = process.env) {
  const value = env.SCRY_QUERY_URL;
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SCRY_QUERY_URL;
}

export function buildScryHeaders({ apiKey, budget = null } = {}) {
  if (!apiKey) {
    throw new Error("SCRY_API_KEY is required for Scry queries.");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "text/plain",
  };

  if (budget !== null && budget !== undefined && String(budget).trim()) {
    headers["X-Scry-Budget"] = String(budget).trim();
  }

  return headers;
}

export async function queryScry(sql, {
  apiKey = getScryApiKey(),
  budget = null,
  fetchImpl = fetch,
  queryUrl = getScryQueryUrl(),
} = {}) {
  if (typeof sql !== "string" || !sql.trim()) {
    throw new Error("A non-empty SQL query is required.");
  }

  const response = await fetchImpl(queryUrl, {
    method: "POST",
    headers: buildScryHeaders({ apiKey, budget }),
    body: sql,
  });

  const text = await response.text();
  const contentType = response.headers?.get?.("content-type") ?? "";
  const body = contentType.includes("application/json") && text ? JSON.parse(text) : text;

  if (!response.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Scry query failed (${response.status}): ${detail}`);
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}
