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
  const renditions = new Map<string, { bytes: Uint8Array; headers: Headers }>();
  mediaFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/_withdrawals/")) return new Response(null, { status: 404 });
    if (url.includes("/_renditions/")) {
      if (init?.method === "PUT") {
        if (renditions.has(url)) return new Response(null, { status: 412 });
        const bytes = init.body as Uint8Array;
        const headers = new Headers(init.headers);
        headers.set("content-length", String(bytes.length));
        renditions.set(url, { bytes, headers });
        return new Response(null, { status: 200 });
      }
      const stored = renditions.get(url);
      return stored ? new Response(null, { headers: stored.headers }) : new Response(null, { status: 404 });
    }
    return new Response(init?.method === "HEAD" ? null : new Uint8Array(mediaBytes), {
      headers: { "Content-Type": "image/webp", "Content-Length": String(mediaBytes.length) },
    });
  });
  vi.stubGlobal("fetch", mediaFetch);
  authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
  publishMocks.publishPublicCache.mockClear();
  mocks.query.mockReset();
  mocks.mutation.mockReset();
  mocks.getServerDataWriteCapability.mockReset();
  mocks.probe.mockReset();
  mocks.probe.mockResolvedValue(undefined);
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

describe("replication corpus route", () => {
  const request = () => new Request("https://dose.wiki/api/dev/replications");

  it("serves the corpus for an editor", async () => {
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, rows: [], effects: [] });
  });

  /**
   * The failure that made the studio unusable in local dev: a rotated admin key
   * reached the route as `[Request ID: …] Server Error` with no reason attached,
   * and the studio reported the corpus as unavailable. Postgres tells the caller
   * nothing, so the route re-tests the token it sent and reports the credential.
   */
  it("distinguishes a rejected credential from a corpus read failure", async () => {
    const opaque = new Error("[Request ID: 12995810d918ffa3] Server Error");
    mocks.query.mockRejectedValue(opaque);
    mocks.probe.mockRejectedValue(opaque);
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
  });

  it("keeps a server failure status when the credential is accepted", async () => {
    mocks.query.mockRejectedValue(new Error("[Request ID: 60e9e02e065c4fa9] Server Error"));
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(500);
  });
});

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

  it("inserts the asset for an admin and publishes the replication collections plus the new record", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    const { POST } = await import("./route");

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "replications.insertMediaAsset",
      expect.objectContaining({ slug: "new-asset", actorEmail: "admin@example.com" }),
    );
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [{ kind: "replication-collections" }, { kind: "replication", slug: "new-asset" }],
      source: "manual",
    });
  });

  it("publishes the owning effect alongside the collections when the asset has one", async () => {
    authMocks.requireRoleSession.mockImplementation(
      roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
    );
    const { POST } = await import("./route");

    const response = await POST(
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
          effectSlug: "tracers",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [
        { kind: "replication-collections" },
        { kind: "effect", slug: "tracers" },
        { kind: "replication", slug: "new-asset" },
      ],
      source: "manual",
    });
  });

  it("never publishes or inserts an interrupted upload", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    mediaFetch.mockResolvedValue(new Response(null, { status: 404 }));
    const { POST } = await import("./route");
    const response = await POST(createRequest());
    expect(response.ok).toBe(false);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
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

  it("does not publish an original when a responsive rendition cannot be verified", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
    const storage = mediaFetch.getMockImplementation()!;
    mediaFetch.mockImplementation(async (url: string, init?: RequestInit) =>
      url.includes("/_renditions/") && init?.method === "HEAD"
        ? new Response(null, { status: 404 })
        : storage(url, init));
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
