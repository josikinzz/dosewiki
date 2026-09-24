import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@auth", () => ({
  authOptions: {},
}));

vi.mock("@server/next/copyBlocks", () => ({
  getCopyByKeys: vi.fn(async () => ({ text: () => "" })),
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: () => null,
}));

import UnauthorizedPage from "./page";

async function renderPage() {
  render(await UnauthorizedPage({ searchParams: Promise.resolve({ from: "/dev" }) }));
}

describe("Unauthorized page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists translator among the roles a route may require", async () => {
    getServerSessionMock.mockResolvedValue(null);
    await renderPage();

    const requiredRole = screen.getByText("Required role").parentElement;
    expect(requiredRole?.textContent).toContain("translator");
    expect(requiredRole?.textContent).toContain("contributor");
    expect(requiredRole?.textContent).toContain("editor");
    expect(requiredRole?.textContent).toContain("admin");
  });

  it("tells a degraded viewer session to sign out and sign in again", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: "member@example.com", role: "viewer" } });
    await renderPage();

    expect(screen.getByText(/sign out and sign in again/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use a different account" })).toBeTruthy();
  });

  it("omits the sign-in-again hint for any other role", async () => {
    for (const session of [null, { user: { email: "c@example.com", role: "contributor" } }]) {
      getServerSessionMock.mockResolvedValue(session);
      const { unmount } = render(await UnauthorizedPage({ searchParams: Promise.resolve({ from: "/dev" }) }));
      expect(screen.queryByText(/sign out and sign in again/i)).toBeNull();
      unmount();
    }
  });

  it("still renders when the session cannot be read", async () => {
    getServerSessionMock.mockRejectedValue(new Error("no secret"));
    await renderPage();

    expect(screen.queryByText(/sign out and sign in again/i)).toBeNull();
    expect(screen.getByText("Required role")).toBeTruthy();
  });
});
