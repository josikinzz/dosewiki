import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as WriteHealth from "@server/data/serverWriteHealth";

const probe = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@server/data/serverWriteHealth", async (importOriginal) => ({
  ...await importOriginal<typeof WriteHealth>(), probeServerDataAdminCredential: probe,
}));
vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: vi.fn(async () => ({ ok: true, session: { user: { email: "editor@example.com" } }, role: "editor" })),
}));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

const originalEnv = process.env;
beforeEach(() => {
  vi.resetModules();
  process.env = { NODE_ENV: "test", DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://private-user:private-password@localhost/dosewiki", DATA_ADMIN_KEY: "admin-secret" };
  probe.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { process.env = originalEnv; vi.restoreAllMocks(); });

const request = async () => {
  // Re-import after resetModules so each test exercises fresh capability configuration.
  const { GET } = await import("./route");
  return GET(new Request("https://dose.wiki/api/editor-config-health"));
};

describe("editor Postgres diagnostics", () => {
  it("reports a healthy Postgres capability without exposing connection credentials", async () => {
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "healthy", canSaveToPostgres: true, postgresUrlConfigured: true });
    expect(body.diagnostics.targets.privilegedWrite.selectedUrl).toBe("postgres://localhost/dosewiki");
    expect(JSON.stringify(body)).not.toContain("private-password");
    expect(JSON.stringify(body)).not.toContain("private-user");
    expect(JSON.stringify(body)).not.toContain("admin-secret");
  });

  it("fails closed without probing when the target is absent or mismatched", async () => {
    delete process.env.POSTGRES_POOLED_URL;
    process.env.DATA_URL = "https://legacy.convex.cloud";
    let body = await (await request()).json();
    expect(body.canSaveToPostgres).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    process.env.POSTGRES_POOLED_URL = "postgres://localhost/dosewiki";
    process.env.POSTGRES_DIRECT_URL = "postgres://localhost/other";
    body = await (await request()).json();
    expect(body.canSaveToPostgres).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("reports active credential rejection without disclosing rejected values", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    probe.mockRejectedValue(new Error("private credential rejection detail"));
    const body = await (await request()).json();
    expect(body).toMatchObject({ status: "unhealthy", canSaveToPostgres: false, postgresUrlConfigured: true });
    expect(JSON.stringify(body)).not.toContain("private credential rejection detail");
    expect(JSON.stringify(body)).not.toContain("admin-secret");
  });
});
