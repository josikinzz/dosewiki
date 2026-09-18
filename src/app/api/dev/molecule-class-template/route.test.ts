import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

import { GET, POST } from "./route";
import { GET as APPLY_GET, POST as APPLY_POST } from "./apply/route";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const dataMocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: dataMocks.getServerDataWriteCapability,
}));

const publishMocks = vi.hoisted(() => ({
  publishPublicCache: vi.fn(async () => [
    { target: "local", status: "accepted", attempts: 1 },
  ]),
}));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

function postRequest(path: string, body: unknown) {
  return new Request(`https://dose.wiki/api/dev/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  authMocks.requireRoleSession.mockImplementation(
    roleSessionFor("admin", { email: "admin@example.com", name: "Admin" }),
  );
  dataMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      client: { query: dataMocks.query, mutation: dataMocks.mutation },
      adminKey: "admin-key",
    },
  });
});

describe("molecule class template routes", () => {
  it("refuses an editor session with 403 on every verb before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    const responses = await Promise.all([
      GET(new Request("https://dose.wiki/api/dev/molecule-class-template?list=1")),
      POST(postRequest("molecule-class-template", { classKey: "phenethylamines", molblock: "mol" })),
      APPLY_GET(new Request("https://dose.wiki/api/dev/molecule-class-template/apply?classKey=phenethylamines")),
      APPLY_POST(postRequest("molecule-class-template/apply", { classKey: "phenethylamines", slugs: ["2c-b"] })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403]);
    expect(authMocks.requireRoleSession).toHaveBeenCalledTimes(4);
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(dataMocks.query).not.toHaveBeenCalled();
    expect(dataMocks.mutation).not.toHaveBeenCalled();
  });

  it("lets an admin list the saved template keys", async () => {
    dataMocks.query.mockResolvedValue(["phenethylamines"]);

    const response = await GET(new Request("https://dose.wiki/api/dev/molecule-class-template?list=1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, templates: ["phenethylamines"] });
  });

  it("saves a template as the admin actor", async () => {
    dataMocks.mutation.mockResolvedValue({ updated: true, updatedAt: 1 });

    const response = await POST(
      postRequest("molecule-class-template", { classKey: "phenethylamines", molblock: "mol" }),
    );

    expect(response.status).toBe(200);
    expect(dataMocks.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        apiKey: "admin-key",
        actorEmail: "admin@example.com",
        classKey: "phenethylamines",
      }),
    );
  });

  it("publishes every applied member plus the class index", async () => {
    dataMocks.mutation.mockImplementation(async (_reference, args: { slug: string }) => ({
      applied: true,
      slug: args.slug,
      updated: true,
    }));

    const response = await APPLY_POST(
      postRequest("molecule-class-template/apply", {
        classKey: "phenethylamines",
        members: [
          { slug: "2c-b", molblock: "mol", svg: "<svg />" },
          { slug: "mescaline", molblock: "mol", svg: "<svg />" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).toHaveBeenCalledWith({
      targets: [
        { kind: "molecule", slug: "2c-b" },
        { kind: "molecule", slug: "mescaline" },
        { kind: "chemical-class-lists" },
      ],
      source: "manual",
    });
    expect(await response.json()).toMatchObject({
      publication: [{ target: "local", status: "accepted" }],
    });
  });

  it("publishes nothing when every member was protected from the template", async () => {
    dataMocks.mutation.mockImplementation(async (_reference, args: { slug: string }) => ({
      applied: false,
      slug: args.slug,
      reason: "protected-hand-edit",
    }));

    const response = await APPLY_POST(
      postRequest("molecule-class-template/apply", {
        classKey: "phenethylamines",
        members: [{ slug: "2c-b", molblock: "mol", svg: "<svg />" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(publishMocks.publishPublicCache).not.toHaveBeenCalled();
  });
});
