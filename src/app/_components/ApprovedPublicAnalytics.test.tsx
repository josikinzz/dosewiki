import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});

describe("ApprovedPublicAnalytics", () => {
  describe("PostHog", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("posthog-js");
    });

    /**
     * The component tracks "already initialised" in module scope, so each case needs a fresh
     * module graph as well as a fresh mock. Re-importing after `resetModules` is the module
     * loading boundary being exercised, so these imports cannot be static.
     */
    async function renderWithMockedPostHog(host: string, key = "phc_test_key") {
      const init = vi.fn();
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", key);
      vi.resetModules();
      vi.doMock("posthog-js", () => ({ default: { init } }));

      const { ApprovedPublicAnalytics: Component } = await import("./ApprovedPublicAnalytics");
      // `act` flushes the effect and the microtask the lazy import resolves on.
      await act(async () => {
        render(<Component host={host} />);
      });

      return init;
    }

    it.each([
      "dosewiki-admin.vercel.app",
      "dosewiki-admin-git-review-josikinzz.vercel.app",
      "localhost",
    ])("never initialises PostHog on %s", async (host) => {
      const init = await renderWithMockedPostHog(host);

      expect(init).not.toHaveBeenCalled();
    });

    it("does not initialise PostHog on an approved host without a project key", async () => {
      const init = await renderWithMockedPostHog("dose.wiki", "");

      expect(init).not.toHaveBeenCalled();
    });

    it("initialises pageview-only PostHog on the approved public host", async () => {
      const init = await renderWithMockedPostHog("dose.wiki");

      await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));

      const [key, config] = init.mock.calls[0] as [string, Record<string, unknown>];
      expect(key).toBe("phc_test_key");
      expect(config).toMatchObject({
        api_host: "/ingest",
        capture_pageview: "history_change",
        capture_pageleave: true,
        // A regression here would start collecting per-interaction or per-session detail
        // about which substance pages a reader opened.
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        capture_exceptions: false,
        // Keeps posthog-js from injecting a remote script the CSP does not allow.
        disable_external_dependency_loading: true,
        persistence: "localStorage",
        respect_dnt: true,
      });
    });
  });
});
