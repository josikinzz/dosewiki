import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MutationCtx } from "@server/postgres/runtime/server";
import {
  authorizeMediaUploadHandler,
  insertMediaAssetHandler,
} from "../../server/lib/replicationWrites";
import type { InsertMediaAssetArgs } from "../../server/lib/replicationValidators";

const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const R2_KEY = `media/sha256/01/${SHA}.webp`;

beforeEach(() => {
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("CLOUDFLARE_R2_S3_ENDPOINT", "https://test.r2.cloudflarestorage.com");
  vi.stubEnv("CLOUDFLARE_R2_BUCKET", "test-media");
  vi.stubEnv("CLOUDFLARE_R2_ACCESS_KEY_ID", "test-access");
  vi.stubEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("REPLICATION_MEDIA_BASE_URL", "https://media.example.test");
});

afterEach(() => {
  delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
  vi.unstubAllEnvs();
});

function args(
  overrides: Partial<InsertMediaAssetArgs> = {},
): InsertMediaAssetArgs {
  const input = {
    expected_absent: true,
    slug: "r2-only-replication",
    title: "R2-only replication",
    artist: "Archive Artist",
    role: "replication",
    type: "image",
    r2_key: R2_KEY,
    effect_tags: [],
    format: "webp",
    rights_status: "unknown",
    ...overrides,
  } as InsertMediaAssetArgs;
  input.mediaReceipts = Object.fromEntries(Object.entries(input)
    .filter(([field, value]) => field.endsWith("r2_key") && typeof value === "string")
    .map(([field, value]) => {
      const extension = (value as string).split(".").pop();
      const receipt = {
        purpose: "replication-import", subject: input.slug, actorEmail: "editor@example.com",
        targetIdentity: "localhost/test", target: "https://test.r2.cloudflarestorage.com/test-media",
        r2Key: value, sha256: SHA, fileSize: input.file_size ?? 100,
        mimeType: extension === "mp4" ? "video/mp4" : `image/${extension}`,
        expiresAt: 4_102_444_800_000,
      };
      const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
      return [field, `${payload}.${createHmac("sha256", "test-secret").update(payload).digest("base64url")}`];
    }));
  return input;
}

/**
 * The identity defaults to admin: every write here lands on the public corpus
 * with no review step, so admin is the floor and the role the happy paths run as.
 */
function mutationContext(options: {
  identityRole?: "admin" | "editor" | "viewer";
} = {}) {
  const insert = vi.fn();
  const query = vi.fn((table: string) => ({
    withIndex: (_index: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      const clauses: Array<[string, unknown]> = [];
      const indexQuery = {
        eq(nextField: string, nextValue: unknown) {
          clauses.push([nextField, nextValue]);
          return this;
        },
      };
      apply(indexQuery);
      const tableRows: Record<string, unknown>[] = table === "memberships"
        ? [{ email: "editor@example.com", role: options.identityRole ?? "admin" }]
        : [];
      const match = () => tableRows.find(
        (row) => clauses.every(([field, value]) => row[field] === value),
      ) ?? null;
      return {
        first: async () => match(),
        unique: async () => match(),
      };
    },
  }));

  const ctx = {
    targetIdentity: "localhost/test",
    auth: {
      getUserIdentity: async () => ({
        subject: "editor",
        email: "editor@example.com",
        name: "Editor",
      }),
    },
    db: { insert, query },
  } as unknown as MutationCtx;

  return { ctx, insert };
}

describe("insertMediaAssetHandler", () => {
  it("rejects an R2 publication without verified media evidence", async () => {
    const { ctx, insert } = mutationContext();
    const input = args();
    input.mediaReceipts = {};
    await expect(insertMediaAssetHandler(ctx, input)).rejects.toThrow(/receipt/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an authenticated viewer and editor before evaluating insert data", async () => {
    for (const identityRole of ["viewer", "editor"] as const) {
      const { ctx, insert } = mutationContext({ identityRole });

      await expect(insertMediaAssetHandler(ctx, args())).rejects.toThrow(
        /Admin access required/,
      );
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it("rejects a viewer and an editor requesting media upload authorization", async () => {
    for (const identityRole of ["viewer", "editor"] as const) {
      const { ctx } = mutationContext({ identityRole });

      await expect(authorizeMediaUploadHandler(ctx, {})).rejects.toThrow(
        /Admin access required/,
      );
    }
  });
});
