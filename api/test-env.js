import { verifyCredentials } from "./_utils/passwords.js";
import { parseBody } from "./_utils/parseBody.js";
import { rateLimit } from "./_utils/rateLimit.js";

const ENABLED_IN_PRODUCTION = process.env.ENABLE_TEST_ENV === "true";

export default async function handler(req, res) {
  if (process.env.NODE_ENV === "production" && !ENABLED_IN_PRODUCTION) {
    return res.status(404).json({ error: "Not found." });
  }

  if (!(await rateLimit(req, res, { windowMs: 60_000, max: 5 }))) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const body = parseBody(req.body);
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyCredentials(username, password)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const keys = ["GITHUB_TOKEN", "ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];
  const keysFound = keys.filter((key) => typeof process.env[key] === "string" && process.env[key].length > 0).length;

  return res.status(200).json({
    ok: true,
    keysFound,
    totalKeys: keys.length,
    timestamp: new Date().toISOString(),
  });
}
