import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("rejects a session below the floor and names the floor", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "contributor@example.com", role: "contributor" },
    });

    const result = await requireRoleSession("editor");

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({ error: "Editor access required." });
    }
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
