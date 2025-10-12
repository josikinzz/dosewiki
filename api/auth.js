import { verifyCredentials, getValidUsernames } from "./_utils/passwords";
import { parseBody } from "./_utils/parseBody";

export default async function handler(req, res) {
  console.log("=== AUTH ENDPOINT CALLED ===");
  console.log("Method:", req.method);

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body = parseBody(req.body);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    console.log("=== CREDENTIALS DEBUG ===");
    console.log("Username received:", username ? "YES" : "NO");
    console.log("Username value:", username);
    console.log("Password received:", password ? "YES" : "NO");
    console.log("Password length:", password.length);

    console.log("=== ENVIRONMENT CHECK ===");
    const validUsernames = getValidUsernames();
    console.log("Valid usernames:", validUsernames.join(", "));
    console.log("Username is valid:", validUsernames.includes(username.trim()));

    const expectedPassword = process.env[username.trim()];
    console.log(`process.env.${username.trim()}:`, expectedPassword ? `EXISTS (${expectedPassword.length} chars)` : "UNDEFINED");

    console.log("=== VERIFYING CREDENTIALS ===");
    const isValid = verifyCredentials(username, password);

    if (!isValid) {
      console.error("❌ AUTHENTICATION FAILED");
      if (!validUsernames.includes(username.trim())) {
        console.error("Reason: Invalid username");
        return res.status(401).json({ error: "Invalid username." });
      }

      if (!expectedPassword) {
        console.error("Reason: Username not configured in environment");
        return res.status(500).json({ error: "Configuration error." });
      }

      console.error("Reason: Password mismatch");
      return res.status(401).json({ error: "Invalid password." });
    }

    console.log("✓ AUTHENTICATION SUCCESSFUL:", username.trim());
    return res.status(200).json({ authorized: true, key: username.trim() });
  } catch (error) {
    console.error("=== AUTH ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Stack trace:", error.stack);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return res.status(500).json({ error: message });
  }
}
