import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleSessionFor } from "@/test/routeSession";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(async () => null),
  query: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: mocks.getServerDataWriteCapability,
}));

import { GET } from "./route";

const author = { email: "author@example.com", name: "Author" };

const rejected = {
  id: "sub-1",
  title: "Alpine clarity",
  status: "rejected",
  submitted_at: "2026-01-01T00:00:00.000Z",
  decided_at: "2026-03-01T10:00:00.000Z",
  public_reason: "The dose for the second substance is missing.",
};

/** Answers like Postgres: only the rows whose contact email is the actor's. */
function storeFor(rowsByEmail: Record<string, unknown[]>) {
  mocks.query.mockImplementation(async (_ref: unknown, args: { actorEmail?: string }) =>
    rowsByEmail[args.actorEmail ?? ""] ?? [],
  );
}

beforeEach(() => {
  mocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("contributor", author));
  mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  mocks.query.mockReset();
  storeFor({ [author.email]: [rejected] });
  mocks.getServerDataWriteCapability.mockReset().mockReturnValue({
    ok: true,
    capability: {
      adminKey: "admin-key",
      getAdminIntentToken: vi.fn(() => "scoped-token"),
      client: { query: mocks.query, mutation: vi.fn() },
    },
  });
});

describe("member submissions route", () => {
  it("shows a rejected submission and its public reason to its author, as the session's actor", async () => {
    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine/submissions"));

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
      apiKey: "scoped-token",
      actorEmail: author.email,
    });
    await expect(response.json()).resolves.toEqual({ ok: true, submissions: [rejected] });
  });

  it("never lets another member read it, whatever the request names", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor("contributor", { email: "other@example.com" }));

    const response = await GET(
      new Request(`https://dose.wiki/api/dev/trip-reports/mine/submissions?email=${author.email}`),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorEmail: "other@example.com" }));
    await expect(response.json()).resolves.toEqual({ ok: true, submissions: [] });
  });

  it("lets only the public fields out, even if a row carries more", async () => {
    storeFor({
      [author.email]: [
        {
          ...rejected,
          review_notes: "Looks copied.",
          reviewed_by: "admin@example.com",
          decision_log: [{ actor: "admin@example.com", note: "Looks copied." }],
          contact_email: author.email,
          ip_hash: "hash",
        },
      ],
    });

    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine/submissions"));
    const body = await response.json();

    expect(body.submissions).toEqual([rejected]);
    expect(JSON.stringify(body)).not.toContain("Looks copied");
    expect(JSON.stringify(body)).not.toContain("admin@example.com");
  });

  it("refuses a signed-out caller without touching Postgres", async () => {
    mocks.requireRoleSession.mockImplementation(roleSessionFor(null));

    const response = await GET(new Request("https://dose.wiki/api/dev/trip-reports/mine/submissions"));

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
