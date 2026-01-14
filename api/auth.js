import { verifyCredentials } from "./_utils/passwords.js";
import { parseBody } from "./_utils/parseBody.js";
import { rateLimit } from "./_utils/rateLimit.js";
import { createLogger } from "./_utils/logger.js";

const log = createLogger("auth");

export default async function handler(req, res) {
  log.debug("Request received", { method: req.method });

  try {
    if (!(await rateLimit(req, res, { windowMs: 60_000, max: 10 }))) {
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body = parseBody(req.body);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    const isValid = verifyCredentials(username, password);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    log.info("Authentication successful");
    return res.status(200).json({ authorized: true, key: username.trim() });
  } catch (error) {
    log.error("Handler error:", error);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return res.status(500).json({ error: message });
  }
}
