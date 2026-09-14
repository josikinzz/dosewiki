import type * as NodeFs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  isEffectIndex: vi.fn(() => false),
  readFile: vi.fn(),
  requireRoleSession: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof NodeFs;
  const promises = { ...actual.promises, readFile: mocks.readFile };
  return {
    ...actual,
    default: { ...actual, promises },
    promises,
  };
});
vi.mock("@/config/siteFlavor", () => ({ isEffectIndex: mocks.isEffectIndex }));
vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: mocks.requireRoleSession,
}));

describe("historical HTML document route", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "true");
    mocks.isEffectIndex.mockReset().mockReturnValue(false);
    mocks.readFile.mockReset().mockResolvedValue("<!doctype html><title>Review ledger</title>");
    mocks.requireRoleSession.mockReset().mockResolvedValue({
      ok: true,
      role: "editor",
      session: { user: { email: "editor@example.com", role: "editor" } },
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns 404 on a public build before authentication or file access", async () => {
    vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "false");
    const response = await GET(new Request("https://dose.wiki/html-docs/review-ledger"), {
      params: Promise.resolve({ doc: "review-ledger" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.requireRoleSession).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("returns 404 for Effect Index even on an editor-shaped build", async () => {
    mocks.isEffectIndex.mockReturnValue(true);

    const response = await GET(new Request("https://effectindex.com/html-docs/review-ledger"), {
      params: Promise.resolve({ doc: "review-ledger" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.requireRoleSession).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("requires an editor session before reading a historical document", async () => {
    mocks.requireRoleSession.mockResolvedValue({
      ok: false,
      response: new Response("Authentication required.", { status: 401 }),
    });
    const response = await GET(new Request("https://dev.dose.wiki/html-docs/review-ledger"), {
      params: Promise.resolve({ doc: "review-ledger" }),
    });

    expect(mocks.requireRoleSession).toHaveBeenCalledWith("editor");
    expect(response.status).toBe(401);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("serves a historical document to an authenticated editor on an editor build", async () => {
    const response = await GET(new Request("https://dev.dose.wiki/html-docs/review-ledger"), {
      params: Promise.resolve({ doc: "review-ledger" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toContain("Review ledger");
  });
});
