import { afterEach, describe, expect, it } from "vitest";
import { requireAdminIntent } from "../server/lib/auth";
import { ADMIN_INTENTS } from "../server/lib/adminIntentTokens";

// Actor and role-floor resolution is covered at the handler seam in
// server/lib/auth.test.ts; this file covers only the admin intent tokens.
describe("Postgres write intent authorization", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE;
  });

  it("maps the legacy admin key to all named admin intents", async () => {
    process.env.DATA_ADMIN_KEY = "secret";

    for (const intent of ADMIN_INTENTS) {
      await expect(requireAdminIntent("secret", intent)).resolves.toMatchObject({
        intent,
        source: "legacy",
        envVar: "DATA_ADMIN_KEY",
      });
    }
  });

  it("rejects a scoped prompt token for unrelated admin intents", async () => {
    process.env.DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE = "prompt-secret";

    await expect(requireAdminIntent("prompt-secret", "promptMigrationWrite")).resolves.toMatchObject({
      intent: "promptMigrationWrite",
      source: "scoped",
      envVar: "DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE",
    });

    for (const intent of ADMIN_INTENTS.filter((candidate) => candidate !== "promptMigrationWrite")) {
      await expect(requireAdminIntent("prompt-secret", intent)).rejects.toThrow(
        "Authentication failed: Invalid API key",
      );
    }
  });

  it("refuses a missing token and a token with nothing configured", async () => {
    await expect(requireAdminIntent(undefined, "legacyAdmin")).rejects.toThrow("Authentication required");
    await expect(requireAdminIntent("anything", "legacyAdmin")).rejects.toThrow(
      "API key authentication not configured",
    );
  });
});
