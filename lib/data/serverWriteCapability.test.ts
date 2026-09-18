import { makeFunctionReference } from "../postgres/runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const io = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() }));
vi.mock("../postgres/runtime/client", () => ({
  PostgresClient: class {
    static fromUrl() { return new this(); }
    query = io.query;
    mutation = io.mutation;
    action = io.action;
  },
}));

const originalEnv = process.env;
const edit = makeFunctionReference<"mutation", { apiKey: string; actorEmail?: string; slug: string }, unknown>("substanceIndex:setArticleField");
const intake = makeFunctionReference<"mutation", { apiKey: string }, unknown>("siteFeedback:create");
const action = makeFunctionReference<"action", { apiKey: string; actorEmail?: string }, unknown>("replications:sync");
const query = makeFunctionReference<"query", { apiKey: string }, unknown>("substanceIndex:getBySlug");

beforeEach(() => {
  vi.resetModules();
  process.env = { NODE_ENV: "test", DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://user:private-password@localhost:5432/dosewiki", DATA_ADMIN_KEY: "editorial-secret", DATA_WRITES_FROZEN: "0" };
  io.query.mockReset().mockResolvedValue({ slug: "lsd" });
  io.mutation.mockReset().mockResolvedValue({ updated: 1 });
  io.action.mockReset().mockResolvedValue({ ran: true });
});
afterEach(() => { process.env = originalEnv; });
// Re-import after resetModules so cached target state cannot leak between scenarios.

const load = () => import("./serverWriteCapability");

describe("Postgres write capabilities", () => {
  it("serves reads and constructs authorized writes without legacy hosted URLs", async () => {
    const capability = (await load()).getServerDataWriteCapabilityOrThrow();
    await expect(capability.client.query(query, { apiKey: capability.adminKey })).resolves.toEqual({ slug: "lsd" });
    await expect(capability.client.mutation(edit, { apiKey: capability.adminKey, actorEmail: "editor@example.com", slug: "lsd" })).resolves.toEqual({ updated: 1 });
    expect(capability.health.canSaveToPostgres).toBe(true);
    const diagnostics = JSON.stringify({ health: capability.health, deployment: capability.deployment });
    expect(diagnostics).toContain("postgres");
    expect(diagnostics).not.toContain("private-password");
    expect(diagnostics).not.toContain("editorial-secret");
  });

  it.each([
    { DATA_BACKEND: undefined },
    { DATA_BACKEND: "convex" },
    { DATA_BACKEND: "postgre" },
    { POSTGRES_POOLED_URL: "" },
    { POSTGRES_POOLED_URL: "https://legacy.convex.cloud" },
    { POSTGRES_DIRECT_URL: "postgres://localhost/other" },
    { TARGET_POSTGRES_URL: "postgres://other.example/dosewiki" },
  ])("fails closed before any client operation for invalid configuration %j", async (invalid) => {
    Object.assign(process.env, invalid);
    process.env.CONVEX_URL = "https://legacy.convex.cloud";
    process.env.DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE = "intake-secret";
    const module = await load();
    expect(module.getServerDataWriteCapability()).toMatchObject({ ok: false, failure: { missing: ["writeUrl"] } });
    expect(module.getPublicIntakeWriteCapability()).toBeNull();
    expect(io.query).not.toHaveBeenCalled();
    expect(io.mutation).not.toHaveBeenCalled();
  });

  it("isolates public intake from editorial credentials and private reads", async () => {
    const module = await load();
    expect(module.getPublicIntakeWriteCapability()).toBeNull();
    delete process.env.DATA_ADMIN_KEY;
    process.env.DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE = "intake-secret";
    const publicCapability = module.getPublicIntakeWriteCapability()!;
    expect(publicCapability.apiKey).toBe("intake-secret");
    expect("query" in publicCapability.client).toBe(false);
    expect("mutation" in publicCapability.client).toBe(false);
    expect(module.getServerDataWriteCapability()).toMatchObject({ ok: false, failure: { missing: ["adminKey"] } });
    await expect(publicCapability.client.mutationAsService(edit, { apiKey: publicCapability.apiKey, slug: "lsd" })).rejects.toThrow(/not allowlisted/);
    expect(io.mutation).not.toHaveBeenCalled();
  });

  it("keeps cached clients isolated by actual database target", async () => {
    const module = await load();
    const first = module.getServerDataWriteCapabilityOrThrow();
    expect(module.getServerDataWriteCapabilityOrThrow().client).toBe(first.client);
    process.env.POSTGRES_POOLED_URL = "postgres://localhost/other";
    const second = module.getServerDataWriteCapabilityOrThrow();
    expect(second.client).not.toBe(first.client);
    expect(second.deployment.writeUrl).toBe("postgres://localhost/other");
  });

  it("selects scoped intent credentials without conflating intents", async () => {
    process.env.DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE = "prompt-secret";
    const capability = (await load()).getServerDataWriteCapabilityOrThrow();
    expect(capability.getAdminIntentToken("promptMigrationWrite")).toBe("prompt-secret");
    expect(capability.getAdminIntentToken("quoteMigrationWrite")).toBe("editorial-secret");
  });

  it("propagates active credential rejection", async () => {
    io.query.mockRejectedValue(new Error("Rejected credential"));
    await expect((await load()).probeServerDataAdminCredential("editor@example.com")).rejects.toThrow("Rejected credential");
  });

  it("requires an actor for normal writes and allows only service intake functions", async () => {
    const client = (await load()).getServerDataWriteCapabilityOrThrow().client;
    await expect(client.mutation(edit, { apiKey: "editorial-secret", slug: "lsd" })).rejects.toThrow(/actorEmail/);
    await expect(client.action(action, { apiKey: "editorial-secret", actorEmail: " " })).rejects.toThrow(/actorEmail/);
    await expect(client.mutationAsService(edit, { apiKey: "editorial-secret", slug: "lsd" })).rejects.toThrow(/not allowlisted/);
    expect(io.mutation).not.toHaveBeenCalled();
    expect(io.action).not.toHaveBeenCalled();
    await expect(client.mutationAsService(intake, { apiKey: "intake-secret" })).resolves.toEqual({ updated: 1 });
  });

  it.each(["1", "mayebe"])("blocks every write while freeze is %s but preserves reads", async (freeze) => {
    process.env.DATA_WRITES_FROZEN = freeze;
    const client = (await load()).getServerDataWriteCapabilityOrThrow().client;
    for (const call of [
      client.mutation(edit, { apiKey: "editorial-secret", actorEmail: "", slug: "lsd" }),
      client.mutationAsService(intake, { apiKey: "intake-secret" }),
      client.action(action, { apiKey: "editorial-secret", actorEmail: "editor@example.com" }),
    ]) await expect(call).rejects.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(io.mutation).not.toHaveBeenCalled();
    expect(io.action).not.toHaveBeenCalled();
    await expect(client.query(query, { apiKey: "editorial-secret" })).resolves.toEqual({ slug: "lsd" });
  });
});
