import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";
import { DataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { PostgresError } from "@server/postgres/runtime/values";
import { POST } from "./route";
import { parseWritingPayload } from "./parseWritingArticleBody";

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
  it.each([undefined, "save-private", "submit-proposal", "unknown"])("refuses unsupported wire intent %s before the mutation", async intent => {
    expect((await POST(request({ ...command, intent }))).status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("keeps proposal content separate from the direct save envelope", () => {
    expect(parseWritingPayload(document)).toMatchObject(document);
    expect(parseWritingPayload({ ...document, intent: "publish" })).not.toHaveProperty("intent");
  });

  it("saves unpublished work without cache publication or translation enqueue", async () => {
    expect((await POST(request(command))).status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ intent: "save-unpublished", status: "draft", expectedRevision: command.expectedRevision, operationId: command.operationId }));
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it.each(["draft", "published"])("publishes the explicit reviewed %s transition", async status => {
    expect((await POST(request({ ...command, intent: "publish", status }))).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

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
