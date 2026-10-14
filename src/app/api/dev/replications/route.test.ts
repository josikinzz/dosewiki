// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";

import { roleSessionFor } from "@/test/routeSession";
import { r2MediaObject, startR2MediaUpload } from "@server/runtime/r2MediaStorage";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    replications: {
      getStudioRows: "replications.getStudioRows",
      insertMediaAsset: "replications.insertMediaAsset",
      authorizeMediaUpload: "replications.authorizeMediaUpload",
    },
  },
}));

const publishMocks = vi.hoisted(() => ({ publishPublicCache: vi.fn(async () => []) }));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

vi.mock("@server/translation/segmentStore", () => ({
  enqueueTranslationJobs: vi.fn(async () => {}),
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
  probe: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
  probeServerDataAdminCredential: mocks.probe,
}));

let mediaBytes: Buffer;
let uploadToken: string;
const mediaFetch = vi.fn();
/**
 * `./route` is imported per test rather than statically: `vi.resetModules()` plus
 * per-test capability mocks mean the module must be evaluated *after* its mocks
 * are in place, which a static import cannot do. Same pattern as the
 * citation-evidence route tests.
 */
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("CLOUDFLARE_R2_S3_ENDPOINT", "https://isolated.r2.cloudflarestorage.com");
  vi.stubEnv("CLOUDFLARE_R2_BUCKET", "isolated-media");
  vi.stubEnv("CLOUDFLARE_R2_ACCESS_KEY_ID", "isolated-key");
  vi.stubEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "isolated-secret");
  vi.stubEnv("REPLICATION_MEDIA_BASE_URL", "https://media.example.test");
  mediaBytes = await sharp({ create: { width: 128, height: 96, channels: 3, background: "#203972" } }).webp().toBuffer();
  uploadToken = startR2MediaUpload(
    r2MediaObject(createHash("sha256").update(mediaBytes).digest("hex"), mediaBytes.length, "image/webp", "webp"),
    "admin@example.com",
  ).uploadToken;
  mediaFetch.mockReset();
  vi.stubGlobal("fetch", mediaFetch);
  authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
  publishMocks.publishPublicCache.mockClear();
  mocks.query.mockReset();
  mocks.mutation.mockReset();
  mocks.getServerDataWriteCapability.mockReset();
  mocks.query.mockImplementation(async (reference: string) => reference === "replications.authorizeMediaUpload"
    ? { actorEmail: "admin@example.com", targetIdentity: "isolated-postgres-target" }
    : { rows: [], effects: [] });
  mocks.mutation.mockResolvedValue({ slug: "new-asset", id: "asset-id" });
  mocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: mocks.query, mutation: mocks.mutation },
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "maintenance-token"),
    },
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("replication create route", () => {
  const createRequest = () =>
    new Request("https://dose.wiki/api/dev/replications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
      body: JSON.stringify({
        slug: "new-asset",
        title: "New asset",
        artist: "Archive Artist",
        type: "image",
        format: "webp",
        uploadToken,
        fileSize: mediaBytes.length,
      }),
    });

  it("refuses an editor creating an asset before any storage read or insertion", async () => {
    const { POST } = await import("./route");

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mediaFetch).not.toHaveBeenCalled();
  });

  it("rejects stored bytes with the wrong digest before durable creation", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    const corrupted = Buffer.from(mediaBytes);
    corrupted[corrupted.length - 1] ^= 1;
    mediaFetch.mockImplementation(async (_url: string, init?: RequestInit) => new Response(init?.method === "HEAD" ? null : corrupted, {
      headers: { "Content-Type": "image/webp", "Content-Length": String(corrupted.length) },
    }));
    const { POST } = await import("./route");
    const response = await POST(createRequest());
    expect(response.ok).toBe(false);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });

  it("refuses final creation if a freeze starts after upload authorization", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    const { POST } = await import("./route");
    const response = await POST(createRequest());
    expect(response.ok).toBe(false);
    expect(mediaFetch).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
