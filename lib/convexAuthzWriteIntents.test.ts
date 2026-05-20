import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, requireAdminIntent, requireAuthenticatedWrite, requireEditorWrite } from "../convex/lib/auth";
import { ADMIN_INTENTS } from "../convex/lib/adminIntentTokens";

type Role = "admin" | "editor" | "viewer";

function createCtx({
  identity,
  memberships = {},
}: {
  identity?: { subject: string; email?: string; name?: string } | null;
  memberships?: Record<string, Role>;
}) {
  return {
    auth: {
      getUserIdentity: vi.fn(async () => identity ?? null),
    },
    db: {
      query: vi.fn(() => ({
        withIndex: (_indexName: string, selector: (query: { eq: (field: string, value: string) => unknown }) => unknown) => {
          let email = "";
          selector({
            eq: (_field, value) => {
              email = value;
              return {};
            },
          });

          return {
            unique: vi.fn(async () => {
              const role = memberships[email];
              return role ? { email, role } : null;
            }),
          };
        },
      })),
    },
  } as never;
}

describe("Convex write intent authorization", () => {
  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE;
    delete process.env.CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE;
    delete process.env.CONVEX_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE;
    delete process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
    delete process.env.CONVEX_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
    delete process.env.CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION;
    delete process.env.CONVEX_ADMIN_TOKEN_PRODUCTION_SYNC;
    delete process.env.CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE;
    delete process.env.CONVEX_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW;
  });

  it("allows editor and admin memberships for editor writes", async () => {
    await expect(
      requireEditorWrite(
        createCtx({
          identity: { subject: "user-1", email: "Editor@Example.com", name: "Editor" },
          memberships: { "editor@example.com": "editor" },
        }),
      ),
    ).resolves.toMatchObject({ email: "editor@example.com", role: "editor", authMethod: "identity" });

    await expect(
      requireEditorWrite(
        createCtx({
          identity: { subject: "user-2", email: "admin@example.com", name: "Admin" },
          memberships: { "admin@example.com": "admin" },
        }),
      ),
    ).resolves.toMatchObject({ email: "admin@example.com", role: "admin" });
  });

  it("rejects viewers, unknown users, and users without memberships for editor writes", async () => {
    await expect(
      requireEditorWrite(
        createCtx({
          identity: { subject: "viewer", email: "viewer@example.com" },
          memberships: { "viewer@example.com": "viewer" },
        }),
      ),
    ).rejects.toThrow(new AuthError("Editor access required"));

    await expect(requireEditorWrite(createCtx({ identity: null }))).rejects.toThrow(
      "Authentication required",
    );

    await expect(
      requireEditorWrite(
        createCtx({
          identity: { subject: "missing", email: "missing@example.com" },
          memberships: {},
        }),
      ),
    ).rejects.toThrow("Editor access required");
  });

  it("treats a valid API key without delegated actor as a script admin actor", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      requireEditorWrite(createCtx({ identity: null }), { apiKey: "secret" }),
    ).resolves.toMatchObject({
      email: "system@dosewiki.internal",
      role: "admin",
      authMethod: "apiKey",
    });
  });

  it("maps the legacy admin key to all named admin intents", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    for (const intent of ADMIN_INTENTS) {
      await expect(requireAdminIntent("secret", intent)).resolves.toMatchObject({
        intent,
        source: "legacy",
        envVar: "CONVEX_ADMIN_KEY",
      });
    }
  });

  it("rejects a scoped prompt token for unrelated admin intents", async () => {
    process.env.CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE = "prompt-secret";

    await expect(requireAdminIntent("prompt-secret", "promptMigrationWrite")).resolves.toMatchObject({
      intent: "promptMigrationWrite",
      source: "scoped",
      envVar: "CONVEX_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE",
    });

    await expect(requireAdminIntent("prompt-secret", "editorArticleWrite")).rejects.toThrow(
      "Authentication failed: Invalid API key",
    );
    await expect(requireAdminIntent("prompt-secret", "profileMediaWrite")).rejects.toThrow(
      "Authentication failed: Invalid API key",
    );
    await expect(requireAdminIntent("prompt-secret", "replicationMaintenance")).rejects.toThrow(
      "Authentication failed: Invalid API key",
    );
    await expect(requireAdminIntent("prompt-secret", "articleSourceMigration")).rejects.toThrow(
      "Authentication failed: Invalid API key",
    );
    await expect(requireAdminIntent("prompt-secret", "citationEvidenceWrite")).rejects.toThrow(
      "Authentication failed: Invalid API key",
    );
    await expect(requireAdminIntent("prompt-secret", "citationEvidenceReview")).rejects.toThrow(
      "Authentication failed: Invalid API key",
    );
  });

  it("derives delegated API-key actor roles from memberships, not caller-provided role facts", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";

    await expect(
      requireAuthenticatedWrite(
        createCtx({
          identity: null,
          memberships: { "viewer@example.com": "viewer" },
        }),
        { apiKey: "secret", actorEmail: "Viewer@Example.com" },
      ),
    ).resolves.toMatchObject({
      email: "viewer@example.com",
      role: "viewer",
      authMethod: "apiKey",
    });

    await expect(
      requireEditorWrite(
        createCtx({
          identity: null,
          memberships: { "viewer@example.com": "viewer" },
        }),
        { apiKey: "secret", actorEmail: "viewer@example.com" },
      ),
    ).rejects.toThrow("Editor access required");
  });

  it("ignores delegated actor email for direct identity calls", async () => {
    await expect(
      requireAuthenticatedWrite(
        createCtx({
          identity: { subject: "viewer", email: "viewer@example.com" },
          memberships: {
            "admin@example.com": "admin",
            "viewer@example.com": "viewer",
          },
        }),
        { actorEmail: "admin@example.com" },
      ),
    ).resolves.toMatchObject({
      email: "viewer@example.com",
      role: "viewer",
      authMethod: "identity",
    });
  });
});
