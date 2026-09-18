import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireRoleSession } from "./requireEditorSession";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@auth", () => ({
  authOptions: {},
}));

describe("requireRoleSession", () => {
  beforeEach(() => {
    mocks.getServerSession.mockReset();
    vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects an authenticated admin on a public build", async () => {
    vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "false");
    mocks.getServerSession.mockResolvedValue({
      user: { email: "admin@example.com", role: "admin" },
    });
    const result = await requireRoleSession("admin");
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.response.status).toBe(403);
  });

  it("rejects anonymous requests", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const result = await requireRoleSession("contributor");

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects a viewer session at every floor, including contributor", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "viewer@example.com", role: "viewer" },
    });

    for (const floor of ["contributor", "editor", "admin"] as const) {
      const result = await requireRoleSession(floor);
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.response.status).toBe(403);
      }
    }
  });

  it("rejects a contributor session at the editor floor", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "contributor@example.com", role: "contributor" },
    });

    const result = await requireRoleSession("editor");

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(403);
    }
  });

  it("requires Translator separately from Editor and admits both capabilities when assigned", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { email: "editor@example.com", role: "editor" } });
    expect((await requireRoleSession("translator")).ok).toBe(false);
    mocks.getServerSession.mockResolvedValue({ user: { email: "editor@example.com", role: "editor_translator", glossaryLocales: ["nl"] } });
    expect((await requireRoleSession("editor")).ok).toBe(true);
    const translator = await requireRoleSession("translator");
    expect(translator.ok).toBe(true);
    if (translator.ok) expect(translator.session.user.glossaryLocales).toEqual(["nl"]);
  });

  it("permits a session at or above the floor", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });

    const result = await requireRoleSession("contributor");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("editor");
      expect(result.session.user.email).toBe("editor@example.com");
    }
  });
});
