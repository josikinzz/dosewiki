import { describe, expect, it } from "vitest";

import { resolveProductionSyncCredentials } from "./production-sync-credentials.mjs";

describe("production sync credential plan", () => {
  it("uses the narrowest scoped token for each authenticated table", () => {
    const credentials = resolveProductionSyncCredentials({
      selectedTables: [
        "substanceIndex",
        "siteConfig",
        "prompts",
        "quotes",
        "categoryLayout",
      ],
      env: {
        DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE: "article-scoped",
        DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE: "prompt-scoped",
        DATA_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE: "quote-scoped",
        DATA_ADMIN_KEY: "master-fallback",
      },
    });

    expect(credentials.substanceIndex).toMatchObject({ token: "article-scoped", source: "scoped" });
    expect(credentials.siteConfig).toMatchObject({ token: "article-scoped", source: "scoped" });
    expect(credentials.prompts).toMatchObject({ token: "prompt-scoped", source: "scoped" });
    expect(credentials.quotes).toMatchObject({ token: "quote-scoped", source: "scoped" });
    expect(credentials.categoryLayout).toMatchObject({ token: "master-fallback", source: "legacy" });
  });

  it("does not require credentials when only unauthenticated internal tables are selected", () => {
    expect(resolveProductionSyncCredentials({
      selectedTables: ["tripReports", "subjectiveEffects", "replications"],
      env: {},
    })).toEqual({});
  });

  it("requires only the credential for the selected authenticated table", () => {
    expect(resolveProductionSyncCredentials({
      selectedTables: ["prompts"],
      env: { DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE: "prompt-scoped" },
    }).prompts.token).toBe("prompt-scoped");

    expect(() => resolveProductionSyncCredentials({
      selectedTables: ["prompts"],
      env: {},
    })).toThrow(/prompts.*DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE/s);
  });

  it("does not substitute the aggregate production token for a legacy-only mutation", () => {
    expect(() => resolveProductionSyncCredentials({
      selectedTables: ["categoryLayout"],
      env: { DATA_ADMIN_TOKEN_PRODUCTION_SYNC: "aggregate-token" },
    })).toThrow(/categoryLayout.*DATA_ADMIN_KEY/s);
  });
});
