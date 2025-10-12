import { findPasswordKey, loadPasswordEntries } from "./_utils/passwords";

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

export default async function handler(req, res) {
  console.log("=== AUTH ENDPOINT CALLED ===");
  console.log("Method:", req.method);

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body = parseBody(req.body);
    const providedPassword = typeof body.password === "string" ? body.password : "";

    // Debug: Password info
    console.log("=== PASSWORD DEBUG ===");
    console.log("Password received:", providedPassword ? "YES" : "NO");
    console.log("Password length:", providedPassword.length);
    console.log("Password first 3 chars:", providedPassword.substring(0, 3));
    console.log("Password last 3 chars:", providedPassword.substring(providedPassword.length - 3));

    // Debug: Environment check
    console.log("=== ENVIRONMENT CHECK ===");
    console.log("process.env type:", typeof process.env);
    console.log("process.env is null?:", process.env === null);

    // Debug: Direct checks for each password key
    const keys = ["ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];
    console.log("Direct environment variable checks:");
    keys.forEach((key) => {
      const val = process.env[key];
      if (val) {
        console.log(`  ${key}: EXISTS (length: ${val.length})`);
      } else {
        console.log(`  ${key}: UNDEFINED OR EMPTY`);
      }
    });

    // Debug: Load password entries
    console.log("=== LOADING PASSWORD ENTRIES ===");
    const passwordEntries = loadPasswordEntries();
    console.log("Total entries loaded:", passwordEntries.length);
    console.log("Available keys:", passwordEntries.map((e) => e.key).join(", "));

    if (passwordEntries.length === 0) {
      console.error("❌ NO PASSWORD ENTRIES LOADED - CHECK ENVIRONMENT VARIABLES");
      return res.status(500).json({ error: "Server configuration error: No passwords configured." });
    }

    // Debug: Attempt password match
    console.log("=== ATTEMPTING PASSWORD MATCH ===");
    const matchedKey = findPasswordKey(providedPassword, passwordEntries);

    if (!matchedKey) {
      console.error("❌ PASSWORD MATCH FAILED");
      console.log("Provided password trimmed:", providedPassword.trim());
      console.log("Checking against entries:");
      passwordEntries.forEach((entry, idx) => {
        console.log(`  Entry ${idx}: ${entry.key} (length: ${entry.value.length})`);
        console.log(`    Match: ${entry.value === providedPassword.trim() ? "YES ✓" : "NO ✗"}`);
      });
      return res.status(401).json({ error: "Invalid password." });
    }

    console.log("✓ PASSWORD MATCHED:", matchedKey);
    return res.status(200).json({ authorized: true, key: matchedKey });
  } catch (error) {
    console.error("=== AUTH ERROR ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Stack trace:", error.stack);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return res.status(500).json({ error: message });
  }
}
