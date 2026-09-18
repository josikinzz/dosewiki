import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole } from "../server/lib/auth";
import { ADMIN_INTENTS, getAdminIntentEnvVar } from "../server/lib/adminIntentTokens";

const SCOPED_SECRET = "public-intake-secret";
const context = { auth: { getUserIdentity: async () => null } } as never;

describe("public intake token authorization", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_ADMIN_KEY", "legacy-admin-secret");
    for (const intent of ADMIN_INTENTS) {
      const name = getAdminIntentEnvVar(intent);
      if (name) vi.stubEnv(name, "");
    }
    vi.stubEnv("DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE", SCOPED_SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the intake credential only for intake, never for editorial authority", async () => {
    await expect(requireRole(context, {
      apiKey: SCOPED_SECRET, adminIntent: "publicIntakeCreate",
    }, "editor")).resolves.toMatchObject({ adminIntent: "publicIntakeCreate" });

    for (const intent of ADMIN_INTENTS) {
      if (intent === "publicIntakeCreate") continue;
      await expect(requireRole(context, {
        apiKey: SCOPED_SECRET, adminIntent: intent,
      }, "editor")).rejects.toThrow("Authentication failed: Invalid API key");
    }
  });

  it("preserves trusted-server intake during the application cutover", async () => {
    await expect(requireRole(context, {
      apiKey: "legacy-admin-secret", adminIntent: "publicIntakeCreate",
    }, "editor")).resolves.toMatchObject({ authMethod: "apiKey", role: "admin" });
  });
});
