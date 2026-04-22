import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDevModeSessionCredentials } from "./useDevModeSessionCredentials";

const AUTH_SESSION_CREDENTIAL = "__AUTHJS_SESSION__";

describe("useDevModeSessionCredentials", () => {
  it("rejects editor actions when there is no authenticated session", async () => {
    const { result } = renderHook(() =>
      useDevModeSessionCredentials({
        hasAuthenticatedSession: false,
        sessionProfileKey: "",
      }),
    );

    await expect(result.current.verifyDevCredentials()).rejects.toThrow("Sign in before continuing.");
    expect(result.current.passwordKey).toBeNull();
  });

  it("returns Auth.js session credentials and tracks the resolved profile key", async () => {
    const { result, rerender } = renderHook(
      ({ hasAuthenticatedSession, sessionProfileKey }) =>
        useDevModeSessionCredentials({
          hasAuthenticatedSession,
          sessionProfileKey,
        }),
      {
        initialProps: {
          hasAuthenticatedSession: true,
          sessionProfileKey: "JOSIE",
        },
      },
    );

    await act(async () => {
      await expect(result.current.verifyDevCredentials()).resolves.toEqual({
        username: "JOSIE",
        password: AUTH_SESSION_CREDENTIAL,
        key: "JOSIE",
      });
    });

    expect(result.current.passwordKey).toBe("JOSIE");

    rerender({
      hasAuthenticatedSession: true,
      sessionProfileKey: "EDITOR",
    });

    await act(async () => {
      await expect(result.current.verifyDevCredentials()).resolves.toEqual({
        username: "EDITOR",
        password: AUTH_SESSION_CREDENTIAL,
        key: "EDITOR",
      });
    });

    expect(result.current.passwordKey).toBe("EDITOR");
  });
});
