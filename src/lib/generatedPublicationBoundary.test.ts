 
import { PostgresError } from "@server/postgres/runtime/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishReviewedSectionHandler } from "../../server/substanceIndex";

type Role = "admin" | "editor" | "viewer";

function ctxWithMemberships(memberships: Record<string, Role> = {}) {
  return {
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
