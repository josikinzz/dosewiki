import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));
const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
const dataMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@server/postgres/runtime/api", () => ({
  api: { replications: { authorizeMediaUpload: "replications.authorizeMediaUpload" } },
}));
vi.mock("@/lib/auth/requireEditorSession", () => ({ requireRoleSession: authMocks.requireRoleSession }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: { client: { query: dataMocks.query }, adminKey: "admin-key", getAdminIntentToken: () => "maintenance-token" },
  }),
}));

import { POST } from "./route";
import { readR2MediaUploadReceipt } from "@server/runtime/r2MediaStorage";

const sha256 = "a".repeat(64);
const storageFetch = vi.fn();
const request = (overrides: Record<string, unknown> = {}) => new Request("https://dose.wiki/api/dev/replications/upload-url", {
  method: "POST",
  headers: { Origin: "https://dose.wiki", "Content-Type": "application/json" },
  body: JSON.stringify({ sha256, format: "webp", type: "image", fileSize: 3, ...overrides }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("DATA_WRITES_FROZEN", "0");
  vi.stubEnv("CLOUDFLARE_R2_S3_ENDPOINT", "https://isolated.r2.cloudflarestorage.com");
  vi.stubEnv("CLOUDFLARE_R2_BUCKET", "isolated-media");
  vi.stubEnv("CLOUDFLARE_R2_ACCESS_KEY_ID", "isolated-key");
  vi.stubEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "isolated-secret");
  vi.stubEnv("REPLICATION_MEDIA_BASE_URL", "https://media.example.test");
  authMocks.requireRoleSession.mockImplementation(roleSessionFor("admin", { email: "admin@example.com" }));
  dataMocks.query.mockReset();
  dataMocks.query.mockResolvedValue({ actorEmail: "admin@example.com", targetIdentity: "isolated-postgres-target" });
  storageFetch.mockReset();
  storageFetch.mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", storageFetch);
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("replication upload start", () => {
  it("refuses an editor before granting a storage upload", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("uploadUrl");
  });

  it("grants an immutable PUT with an actor-bound receipt instead of a storage response protocol", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const upload = await response.json();
    expect(upload.method).toBe("PUT");
    expect(upload.uploadUrl).toBe(`https://isolated.r2.cloudflarestorage.com/isolated-media/media/sha256/aa/${sha256}.webp`);
    expect(upload.uploadHeaders).toMatchObject({ "if-none-match": "*", "content-type": "image/webp", "x-amz-content-sha256": sha256 });
    expect(upload).not.toHaveProperty("storageId");
    expect(readR2MediaUploadReceipt(upload.uploadToken, "admin@example.com")).toMatchObject({ sha256, fileSize: 3, mimeType: "image/webp" });
    expect(() => readR2MediaUploadReceipt(upload.uploadToken, "another@example.com")).toThrow();
    const [payload, signature] = upload.uploadToken.split(".");
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), fileSize: 4 })).toString("base64url");
    expect(() => readR2MediaUploadReceipt(`${tampered}.${signature}`, "admin@example.com")).toThrow();
  });

  it("does not issue an upload when frozen", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    const response = await POST(request());
    expect(response.ok).toBe(false);
    expect(await response.json()).not.toHaveProperty("uploadUrl");
  });

  it.each([
    ["a withdrawal marker exists", 200],
    ["the withdrawal lookup fails", 503],
  ])("withholds browser upload credentials when %s", async (_reason, status) => {
    storageFetch.mockResolvedValue(new Response(null, { status }));
    const response = await POST(request());
    expect(response.ok).toBe(false);
    const body = await response.json();
    expect(body).not.toHaveProperty("uploadUrl");
    expect(body).not.toHaveProperty("uploadHeaders");
    expect(body).not.toHaveProperty("uploadToken");
  });

  it("does not issue storage credentials when maintenance authorization fails", async () => {
    dataMocks.query.mockRejectedValue(new Error("Rejected maintenance credential"));
    const response = await POST(request());
    expect(response.ok).toBe(false);
    expect(storageFetch).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty("uploadHeaders");
  });

  it("rejects a type that contradicts the supported file format", async () => {
    const response = await POST(request({ type: "video" }));
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty("uploadUrl");
  });
});
