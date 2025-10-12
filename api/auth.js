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
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body = parseBody(req.body);
    const providedPassword = typeof body.password === "string" ? body.password : "";

    console.log("=== AUTH DEBUG START ===");
    console.log("Password length:", providedPassword.length);
    console.log("Password (first 3 chars):", providedPassword.substring(0, 3));

    const passwordEntries = loadPasswordEntries();
    console.log("Loaded entries count:", passwordEntries.length);
    console.log("Available keys:", passwordEntries.map((entry) => entry.key));

    console.log("Direct env access test:");
    const envKeysToTest = ["ADMIN_PASSWORD", "ZENBY", "KOSM", "COE", "JOSIE", "WITCHY", "ARCTIC"];
    envKeysToTest.forEach((key) => {
      const value = process.env?.[key];
      if (typeof value === "string") {
        console.log(`  ${key}: EXISTS (${value.length} chars)`);
      } else {
        console.log(`  ${key}: UNDEFINED`);
      }
    });
    console.log("=== AUTH DEBUG END ===");

    const matchedKey = findPasswordKey(providedPassword, passwordEntries);
    if (!matchedKey) {
      console.error("No password match found");
      return res.status(401).json({ error: "Invalid password." });
    }

    console.log("Password matched:", matchedKey);
    return res.status(200).json({ authorized: true, key: matchedKey });
  } catch (error) {
    console.error("/api/auth error", error);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return res.status(500).json({ error: message });
  }
}
