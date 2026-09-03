import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, sessionState } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  sessionState: {
    status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated",
    data: null as
      | null
      | {
          user?: {
            email?: string | null;
            name?: string | null;
            image?: string | null;
            role?: string | null;
          };
        },
  },
}));

vi.mock("next-auth/react", () => ({
  getSession: getSessionMock,
  useSession: () => sessionState,
}));

vi.mock("@/lib/auth/roles", () => ({
  canAccessDev: (role?: string | null) => role === "admin" || role === "editor",
}));

import { useDevRouteAccess } from "./useDevRouteAccess";

describe("useDevRouteAccess", () => {
  beforeEach(() => {
    sessionState.status = "unauthenticated";
    sessionState.data = null;
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue(null);
  });

  it("does not redirect while the session is still loading", () => {
    sessionState.status = "loading";
    const onTabChange = vi.fn();

    renderHook(() =>
      useDevRouteAccess({
        activeTab: "citation-review",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("sends a signed-out session from an editor-only tab to Contributors", async () => {
    const onTabChange = vi.fn();

    renderHook(() =>
      useDevRouteAccess({
        activeTab: "articles",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith("contributors");
    });
  });

  it("sends authenticated non-editors from editor-only tabs to Contributors and reports the flags", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "reader@example.com", role: "member" } };
    const onTabChange = vi.fn();

    const { result } = renderHook(() =>
      useDevRouteAccess({
        activeTab: "articles",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith("contributors");
    });
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.canEdit).toBe(false);
  });

  it("leaves a non-editor alone on Contributors", () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "reader@example.com", role: "member" } };
    const onTabChange = vi.fn();

    renderHook(() =>
      useDevRouteAccess({
        activeTab: "contributors",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("allows editors to remain on protected tabs", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "editor@example.com", role: "editor" } };
    const onTabChange = vi.fn();

    const { result } = renderHook(() =>
      useDevRouteAccess({
        activeTab: "articles",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.canEdit).toBe(true);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("keeps an editor in place when a resolved session momentarily reads as signed out", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "editor@example.com", role: "editor" } };
    const onTabChange = vi.fn();

    const { rerender } = renderHook(() =>
      useDevRouteAccess({
        activeTab: "review",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    // A failed /api/auth/session refetch resolves to null, which next-auth
    // reports as a clean sign-out; the forced re-check says otherwise.
    getSessionMock.mockResolvedValue({ user: { email: "editor@example.com", role: "editor" } });
    sessionState.status = "unauthenticated";
    sessionState.data = null;
    rerender();

    await waitFor(() => {
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("redirects once the re-check confirms the session is really gone", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "editor@example.com", role: "editor" } };
    const onTabChange = vi.fn();

    const { rerender } = renderHook(() =>
      useDevRouteAccess({
        activeTab: "review",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    sessionState.status = "unauthenticated";
    sessionState.data = null;
    rerender();

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith("contributors");
    });
  });

  it("derives profile keys from explicit props, email, and name fallback", () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "josie@example.com", name: "Josie Person" } };

    const explicit = renderHook(() =>
      useDevRouteAccess({
        activeTab: "contributors",
        initialProfileKey: " abc ",
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
    expect(explicit.result.current.sessionProfileKey).toBe("ABC");

    const email = renderHook(() =>
      useDevRouteAccess({
        activeTab: "contributors",
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
    expect(email.result.current.sessionProfileKey).toBe("JOSIE");

    sessionState.data = { user: { name: "Jane Doe!" } };
    const name = renderHook(() =>
      useDevRouteAccess({
        activeTab: "contributors",
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
    expect(name.result.current.sessionProfileKey).toBe("JANEDOE");
  });
});
