import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@auth", () => ({
  authOptions: {},
}));

describe("requireEditorSession", () => {
  beforeEach(() => {
    mocks.getServerSession.mockReset();
  });

  it("rejects anonymous requests", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { requireEditorSession } = await import("./requireEditorSession");

    const result = await requireEditorSession();

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(401);
    }
  });

  it("rejects authenticated viewers from editor write routes", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "viewer@example.com", role: "viewer" },
    });
    const { requireEditorSession } = await import("./requireEditorSession");

    const result = await requireEditorSession();

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(403);
    }
  });

  it("permits authenticated editors", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });
    const { requireEditorSession } = await import("./requireEditorSession");

    const result = await requireEditorSession();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("editor");
      expect(result.session.user.email).toBe("editor@example.com");
    }
  });
});
