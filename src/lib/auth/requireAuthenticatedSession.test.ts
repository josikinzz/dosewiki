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

describe("requireAuthenticatedSession", () => {
  beforeEach(() => {
    mocks.getServerSession.mockReset();
  });

  it("rejects anonymous profile writes", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { requireAuthenticatedSession } = await import("./requireAuthenticatedSession");

    const result = await requireAuthenticatedSession();

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.response.status).toBe(401);
    }
  });

  it("permits authenticated viewer self-profile flow", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "viewer@example.com", role: "viewer" },
    });
    const { requireAuthenticatedSession } = await import("./requireAuthenticatedSession");

    const result = await requireAuthenticatedSession();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("viewer");
      expect(result.session.user.email).toBe("viewer@example.com");
    }
  });
});
