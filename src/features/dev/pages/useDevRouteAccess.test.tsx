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

import { useDevRouteAccess } from "./useDevRouteAccess";

describe("useDevRouteAccess", () => {
  beforeEach(() => {
    sessionState.status = "unauthenticated";
    sessionState.data = null;
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue(null);
  });

  function renderAccess(activeTab: Parameters<typeof useDevRouteAccess>[0]["activeTab"]) {
    return renderHook(() =>
      useDevRouteAccess({
        activeTab,
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
  }

  it("reports no lock and no role while the session is still loading", () => {
    sessionState.status = "loading";

    const { result } = renderAccess("citation-review");

    expect(result.current.role).toBeNull();
    expect(result.current.activeTabLockReason).toBeNull();
  });

  it("locks every tab behind sign-in for a session that never authenticated", async () => {
    const { result } = renderAccess("articles");

    await waitFor(() => {
      expect(result.current.activeTabLockReason).toBe("Sign in required");
    });
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.canDraft).toBe(false);
  });

  it.each([
    // role, tab, lock reason, canDraft, canApprove
    ["admin", "banners", null, true, true],
    ["editor", "articles", null, true, false],
    ["editor", "banners", "Admin role required", true, false],
    ["contributor", "contributors", null, false, false],
    ["contributor", "articles", "Editor role required", false, false],
    ["contributor", "banners", "Admin role required", false, false],
    ["viewer", "contributors", "Contributor role required", false, false],
  ] as const)("resolves %s on %s", async (role, activeTab, lockReason, draft, approve) => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "member@example.com", role } };

    const { result } = renderAccess(activeTab);

    await waitFor(() => {
      expect(result.current.activeTabLockReason).toBe(lockReason);
    });
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.role).toBe(role);
    expect(result.current.canDraft).toBe(draft);
    expect(result.current.canApprove).toBe(approve);
  });

  it("treats an unknown stored role as no role", () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "reader@example.com", role: "owner" } };

    const { result } = renderAccess("contributors");

    expect(result.current.role).toBeNull();
    expect(result.current.activeTabLockReason).toBe("Sign in required");
  });

  it("keeps an editor's tool open when a resolved session momentarily reads as signed out", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "editor@example.com", role: "editor" } };

    const { result, rerender } = renderAccess("articles");
    expect(result.current.activeTabLockReason).toBeNull();

    // A failed /api/auth/session refetch resolves to null, which next-auth
    // reports as a clean sign-out; the forced re-check says otherwise.
    getSessionMock.mockResolvedValue({ user: { email: "editor@example.com", role: "editor" } });
    sessionState.status = "unauthenticated";
    sessionState.data = null;
    rerender();

    await waitFor(() => {
      expect(getSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.activeTabLockReason).toBeNull();
  });

  it("locks the tool once the re-check confirms the session is really gone", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "editor@example.com", role: "editor" } };

    const { result, rerender } = renderAccess("articles");

    sessionState.status = "unauthenticated";
    sessionState.data = null;
    rerender();

    await waitFor(() => {
      expect(result.current.activeTabLockReason).toBe("Sign in required");
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
