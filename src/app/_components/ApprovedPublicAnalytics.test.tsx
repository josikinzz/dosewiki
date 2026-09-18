import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ApprovedPublicAnalytics", () => {
  describe("PostHog", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetModules();
      vi.doUnmock("posthog-js");
    });

    /**
     * The component tracks "already initialised" in module scope, so each case needs a fresh
     * module graph as well as a fresh mock. Re-importing after `resetModules` is the module
     * loading boundary being exercised, so these imports cannot be static.
     */
    async function preparePostHog(
      host: string,
      key = "phc_test_key",
      visibility: () => DocumentVisibilityState = () => "visible",
      readyState: DocumentReadyState = "complete",
    ) {
      const init = vi.fn();
      const moduleLoaded = vi.fn();
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", key);
      vi.useFakeTimers();
      vi.spyOn(document, "readyState", "get").mockReturnValue(readyState);
      vi.spyOn(document, "visibilityState", "get").mockImplementation(
        visibility,
      );
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 16),
      );
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) =>
        window.clearTimeout(handle),
      );
      vi.stubGlobal("requestIdleCallback", undefined);
      vi.stubGlobal("cancelIdleCallback", undefined);
      vi.resetModules();
      vi.doMock("posthog-js", () => {
        moduleLoaded();
        return { default: { init } };
      });

      const { ApprovedPublicAnalytics: Component } =
        await import("./ApprovedPublicAnalytics");
      const view = render(<Component host={host} />);

      return { Component, init, moduleLoaded, view };
    }

    async function finishFallbackDelay() {
      await act(async () => {
        vi.advanceTimersByTime(1_016);
        await Promise.resolve();
      });
    }

    it.each([
      "dosewiki-admin.vercel.app",
      "dosewiki-admin-git-review-example.vercel.app",
      "localhost",
    ])("never initialises PostHog on %s", async (host) => {
      const { init, moduleLoaded } = await preparePostHog(host);
      await finishFallbackDelay();

      expect(moduleLoaded).not.toHaveBeenCalled();
      expect(init).not.toHaveBeenCalled();
    });

    it("does not initialise PostHog on an approved host without a project key", async () => {
      const { init, moduleLoaded } = await preparePostHog("dose.wiki", "");
      await finishFallbackDelay();

      expect(moduleLoaded).not.toHaveBeenCalled();
      expect(init).not.toHaveBeenCalled();
    });

    it("waits for a painted frame and the bounded idle fallback before importing PostHog", async () => {
      const { init, moduleLoaded } = await preparePostHog("dose.wiki");

      expect(moduleLoaded).not.toHaveBeenCalled();
      expect(init).not.toHaveBeenCalled();

      await finishFallbackDelay();

      expect(moduleLoaded).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it("waits while hidden and resumes scheduling when the document becomes visible", async () => {
      let visibility: DocumentVisibilityState = "hidden";
      const { init, moduleLoaded } = await preparePostHog(
        "dose.wiki",
        "phc_test_key",
        () => visibility,
      );

      await finishFallbackDelay();
      expect(moduleLoaded).not.toHaveBeenCalled();

      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      await finishFallbackDelay();

      expect(moduleLoaded).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it("waits for document load before scheduling analytics", async () => {
      const { init, moduleLoaded } = await preparePostHog(
        "dose.wiki",
        "phc_test_key",
        () => "visible",
        "loading",
      );

      await finishFallbackDelay();
      expect(moduleLoaded).not.toHaveBeenCalled();

      window.dispatchEvent(new Event("load"));
      await finishFallbackDelay();

      expect(moduleLoaded).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it("does not initialise after unmount when an in-flight import resolves", async () => {
      const init = vi.fn();
      let resolveImport: (() => void) | undefined;
      const importReady = new Promise<void>((resolve) => {
        resolveImport = resolve;
      });
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
      vi.useFakeTimers();
      vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
        window.setTimeout(() => callback(performance.now()), 16),
      );
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) =>
        window.clearTimeout(handle),
      );
      vi.stubGlobal("requestIdleCallback", undefined);
      vi.stubGlobal("cancelIdleCallback", undefined);
      vi.resetModules();
      vi.doMock("posthog-js", async () => {
        await importReady;
        return { default: { init } };
      });
      const { ApprovedPublicAnalytics: Component } =
        await import("./ApprovedPublicAnalytics");
      const view = render(<Component host="dose.wiki" />);

      await finishFallbackDelay();
      view.unmount();
      resolveImport?.();
      await act(async () => {
        await Promise.resolve();
      });

      expect(init).not.toHaveBeenCalled();
    });

    it("initialises only once across React StrictMode effect remounts", async () => {
      const { Component, init, moduleLoaded, view } =
        await preparePostHog("localhost");
      view.unmount();
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
      render(
        <StrictMode>
          <Component host="dose.wiki" />
        </StrictMode>,
      );

      await finishFallbackDelay();

      expect(moduleLoaded).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it("keeps analytics deferred until the browser grants an idle period", async () => {
      const { init, moduleLoaded } = await preparePostHog("dose.wiki");
      let idleCallback: IdleRequestCallback | undefined;
      vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
        idleCallback = callback;
        return 1;
      });
      vi.stubGlobal("cancelIdleCallback", vi.fn());

      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(moduleLoaded).not.toHaveBeenCalled();
      expect(init).not.toHaveBeenCalled();

      await act(async () => {
        idleCallback?.({ didTimeout: false, timeRemaining: () => 50 });
        await Promise.resolve();
      });
      expect(init).toHaveBeenCalledTimes(1);
    });
  });
});
