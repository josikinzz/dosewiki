 
import { PostgresError } from "@server/postgres/runtime/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requireGeneratedPublicationDeploymentFingerprint } from "../../server/lib/generatedPublication";
import { publishReviewedSectionHandler } from "../../server/substanceIndex";

type Role = "admin" | "editor" | "viewer";

function ctxWithMemberships(memberships: Record<string, Role> = {}, targetIdentity?: string) {
  return {
    targetIdentity,
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      query: vi.fn((table: string) => ({
        withIndex: (_index: string, selector: (query: { eq: (field: string, value: string) => unknown }) => unknown) => {
          let selectedValue = "";
          selector({
            eq: (_field, value) => {
              selectedValue = value;
              return {};
            },
          });
          return {
            unique: vi.fn(async () => {
              if (table !== "memberships") return null;
              const role = memberships[selectedValue];
              return role ? { email: selectedValue, role } : null;
            }),
            take: vi.fn(async () => []),
          };
        },
      })),
      patch: vi.fn(),
      insert: vi.fn(),
    },
  } as never;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("Expected publication boundary to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(PostgresError);
    expect((error as PostgresError<{ code: string }>).data.code).toBe(code);
  }
}

const args = {
  actorEmail: "editor@example.com",
  proposal: {},
};

describe("reviewed publication mutation authorization boundary", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE;
    delete process.env.GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT;
  });

  it("requires the generated-publication scoped token", async () => {
    await expectCode(
      publishReviewedSectionHandler(ctxWithMemberships(), args),
      "SCOPED_TOKEN_REQUIRED",
    );
  });

  it("rejects the legacy admin key", async () => {
    process.env.DATA_ADMIN_KEY = "legacy-token";
    await expectCode(
      publishReviewedSectionHandler(ctxWithMemberships(), { ...args, apiKey: "legacy-token" }),
      "SCOPED_TOKEN_REQUIRED",
    );
  });

  it("rejects viewer membership even with the scoped token", async () => {
    process.env.DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE = "scoped-token";
    await expectCode(
      publishReviewedSectionHandler(
        ctxWithMemberships({ "viewer@example.com": "viewer" }),
        { ...args, apiKey: "scoped-token", actorEmail: "viewer@example.com" },
      ),
      "UNAUTHORIZED",
    );
  });

  it("rejects arbitrary local-credential actor spoofing without a membership", async () => {
    process.env.DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE = "scoped-token";
    await expectCode(
      publishReviewedSectionHandler(
        ctxWithMemberships(),
        { ...args, apiKey: "scoped-token", actorEmail: "forged@local.dose.wiki" },
      ),
      "UNAUTHORIZED",
    );
  });
});


describe("native publication destination binding", () => {
  const identity = "production.example.test/postgres";
  it("accepts the canonical production fingerprint only for the actual pool target", () => {
    expect(requireGeneratedPublicationDeploymentFingerprint({ GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT: identity }, identity)).toBe(identity);
    expect(() => requireGeneratedPublicationDeploymentFingerprint({ GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT: identity }, "other.example/postgres"))
      .toThrowError(expect.objectContaining({ code: "TARGET_DEPLOYMENT_MISMATCH" }));
  });
  it.each(["postgres-rehearsal", "HOST/db", "host:5432/db", "user@host/db", "host/", "host/db/extra"])(
    "rejects noncanonical or ambiguous destination %s", (value) => {
      expect(() => requireGeneratedPublicationDeploymentFingerprint({ GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT: value }, value))
        .toThrowError(expect.objectContaining({ code: "DEPLOYMENT_BINDING_NOT_CONFIGURED" }));
    });
  it("fails closed without an observed pool identity", () => {
    expect(() => requireGeneratedPublicationDeploymentFingerprint({ GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT: identity }))
      .toThrowError(expect.objectContaining({ code: "DEPLOYMENT_BINDING_NOT_CONFIGURED" }));
  });
  it("the role-guarded native handler forwards its actual pool target", async () => {
    process.env.DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE = "scoped-token";
    process.env.GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT = identity;
    await expectCode(publishReviewedSectionHandler(ctxWithMemberships({ "editor@example.com": "editor" }, "wrong.example/postgres"),
      { ...args, apiKey: "scoped-token" }), "TARGET_DEPLOYMENT_MISMATCH");
    await expectCode(publishReviewedSectionHandler(ctxWithMemberships({ "editor@example.com": "editor" }, identity),
      { ...args, apiKey: "scoped-token" }), "INVALID_PROPOSAL");
    delete process.env.DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE;
    delete process.env.GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT;
  });
});
