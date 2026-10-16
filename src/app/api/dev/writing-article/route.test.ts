import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { DataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { PostgresError } from "@server/postgres/runtime/values";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(), mutation: vi.fn(), capability: vi.fn(),
  publish: vi.fn(async () => []), enqueue: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/requireEditorSession", () => ({ requireRoleSession: mocks.requireRoleSession }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));
vi.mock("@server/data/serverWriteCapability", () => ({ getServerDataWriteCapability: mocks.capability }));
vi.mock("@server/next/publishPublicCache", () => ({ publishPublicCache: mocks.publish }));
vi.mock("@server/translation/segmentStore", () => ({ enqueueTranslationJobs: mocks.enqueue }));

const document = { slug: "synthetic-writing", bodyFormat: "markdown", kind: "article", status: "draft", title: "Synthetic draft", body: "Synthetic content", tags: [], authorProfileKeys: [] };
const command = { ...document, intent: "save-unpublished", expectedRevision: "a".repeat(64), operationId: "11111111-1111-4111-8111-111111111111" };
const request = (body: object) => new Request("https://dose.wiki/api/dev/writing-article", { method: "POST", headers: { "content-type": "application/json", Origin: "https://dose.wiki" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRoleSession.mockImplementation(roleSessionFor("admin"));
  mocks.capability.mockReturnValue({ ok: true, capability: { client: { mutation: mocks.mutation }, adminKey: "synthetic-key" } });
  mocks.mutation.mockResolvedValue({ slug: document.slug, created: false, revision: "b".repeat(64) });
});

describe("Writing request intent", () => {
  it.each([
    [new DataWriteFrozenError("synthetic-writing"), 503],
    [new PostgresError({ code: "FIELD_CONFLICT", message: "Synthetic conflict" }), 409],
  ])("keeps publication effects behind a confirmed mutation", async (error, status) => {
    mocks.mutation.mockRejectedValue(error);
    expect((await POST(request({ ...command, intent: "publish" }))).status).toBe(status);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("refuses an editor before writing", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));
    expect((await POST(request(command))).status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
