import { describe, expect, it } from "vitest";

import {
  createBatchProposalReadContext,
  createBatchTargetClient,
  createBatchTargetRunContext,
  requireBatchArticleWriteToken,
  requireBatchProposalTargetUrl,
} from "./batch-targets.mjs";

describe("batch Postgres target policy", () => {
  it("uses shared source and target precedence with CLI overrides first", () => {
    const context = createBatchTargetRunContext({
      operation: "batch test",
      argv: [
        "--source-url=postgresql://localhost/cli-source",
        "--target=postgresql://localhost/cli-target",
        "--dry-run",
      ],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres",
        SOURCE_POSTGRES_URL: "postgresql://localhost/env-source",
        TARGET_POSTGRES_URL: "postgresql://localhost/env-target",
        POSTGRES_DIRECT_URL: "postgresql://localhost/default",
      },
    });

    expect(context.sourceUrl).toBe("postgresql://localhost/cli-source");
    expect(context.sourceUrlKey).toBe("--source-url");
    expect(context.targetUrl).toBe("postgresql://localhost/cli-target");
    expect(context.targetUrlKey).toBe("--target");
  });

  it("prefers explicit target env over source/read fallbacks for writes", () => {
    const context = createBatchTargetRunContext({
      operation: "batch test",
      argv: [],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres",
        SOURCE_POSTGRES_URL: "postgresql://localhost/source",
        TARGET_POSTGRES_URL: "postgresql://localhost/target",
        POSTGRES_DIRECT_URL: "postgresql://localhost/default",
      },
    });

    expect(context.sourceUrl).toBe("postgresql://localhost/source");
    expect(context.targetUrl).toBe("postgresql://localhost/target");
    expect(context.targetUrlKey).toBe("TARGET_POSTGRES_URL");
  });

  it("requires an explicit target for review-only proposals and rejects fallback targets", () => {
    const explicit = createBatchProposalReadContext({
      argv: [
        "--source-url=postgresql://localhost/source",
        "--target=postgresql://localhost/proposal-target",
      ],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres",
        POSTGRES_DIRECT_URL: "postgresql://localhost/default",
        POSTGRES_POOLED_URL: "postgresql://localhost/browser",
      },
    });
    expect(requireBatchProposalTargetUrl(explicit)).toBe("postgresql://localhost/proposal-target");
    expect(explicit.targetUrlKey).toBe("--target");

    const fallbackOnly = createBatchProposalReadContext({
      argv: [],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres",
        SOURCE_POSTGRES_URL: "postgresql://localhost/source",
        POSTGRES_DIRECT_URL: "postgresql://localhost/default",
        POSTGRES_POOLED_URL: "postgresql://localhost/browser",
      },
    });
    expect(() => requireBatchProposalTargetUrl(fallbackOnly)).toThrow(/explicit proposal target/);

    const genericUrlsOnly = createBatchProposalReadContext({
      argv: [],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres",
        POSTGRES_DIRECT_URL: "postgresql://localhost/default",
        POSTGRES_POOLED_URL: "postgresql://localhost/browser",
        TARGET_POSTGRES_URL: "postgresql://localhost/proposal-target",
      },
    });
    expect(genericUrlsOnly.sourceUrl).toBe("postgresql://localhost/proposal-target");
    expect(genericUrlsOnly.sourceUrlKey).toBe("TARGET_POSTGRES_URL");
    expect(requireBatchProposalTargetUrl(genericUrlsOnly)).toBe("postgresql://localhost/proposal-target");
  });

  it("accepts a CLI target as an explicit approved write target", () => {
    const context = createBatchTargetRunContext({
      operation: "batch test",
      argv: [
        "--write",
        "--target=postgresql://localhost/cli-target",
        "--confirm-write=batch-test",
        "--expected-deployment=localhost/cli-target",
      ],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres",},
    });
    class FakeClient {
      constructor(url) {
        this.url = url;
      }
    }

    expect(createBatchTargetClient(context, { Client: FakeClient }).url).toBe(
      "postgresql://localhost/cli-target",
    );
  });

  it("continues to reject browser-derived batch write targets", () => {
    const context = createBatchTargetRunContext({
      operation: "batch test",
      argv: [
        "--write",
        "--confirm-write=batch-test",
        "--expected-deployment=localhost/browser-target",
      ],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgresql://localhost/browser-target" },
    });

    expect(() => createBatchTargetClient(context, { Client: class {} })).toThrow(
      /--target or TARGET_POSTGRES_URL/,
    );
  });

  it("prefers the scoped article-write token over the master key", () => {
    expect(requireBatchArticleWriteToken({
      env: { DATA_BACKEND: "postgres",
        DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE: "scoped-token",
        DATA_ADMIN_KEY: "master-key",
      },
    })).toBe("scoped-token");
  });

});
