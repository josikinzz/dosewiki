import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionState } = vi.hoisted(() => ({
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
  });

  it("redirects unauthenticated profile access back to articles", async () => {
    const onTabChange = vi.fn();

    renderHook(() =>
      useDevRouteAccess({
        activeTab: "profile",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith("articles");
    });
  });

  it("redirects authenticated non-editors to profile from protected tabs", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "reader@example.com", role: "member" } };
    const onTabChange = vi.fn();

    renderHook(() =>
      useDevRouteAccess({
        activeTab: "articles",
        onTabChange,
        onClearNoticesForTab: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith("profile");
    });
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

    expect(result.current.hasNextEditorSession).toBe(true);
    expect(result.current.hasProfileSession).toBe(true);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("derives profile keys from explicit props, email, and name fallback", () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "josie@example.com", name: "Josie Person" } };

    const explicit = renderHook(() =>
      useDevRouteAccess({
        activeTab: "profile",
        initialProfileKey: " abc ",
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
    expect(explicit.result.current.sessionProfileKey).toBe("ABC");

    const email = renderHook(() =>
      useDevRouteAccess({
        activeTab: "profile",
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
    expect(email.result.current.sessionProfileKey).toBe("JOSIE");

    sessionState.data = { user: { name: "Jane Doe!" } };
    const name = renderHook(() =>
      useDevRouteAccess({
        activeTab: "profile",
        onTabChange: vi.fn(),
        onClearNoticesForTab: vi.fn(),
      }),
    );
    expect(name.result.current.sessionProfileKey).toBe("JANEDOE");
  });
});
