import { afterEach, describe, expect, it, vi } from "vitest";
import { isApprovedAnalyticsHost } from "./analyticsHostPolicy";

describe("analytics host boundary", () => {
  it.each([
    "dosewiki-admin.vercel.app",
    "dosewiki-admin-git-security.example.vercel.app",
    "localhost",
    "127.0.0.1",
    "dose.wiki.example.com",
  ])("does not approve authenticated or preview host %s", (host) => {
    expect(isApprovedAnalyticsHost(host)).toBe(false);
  });

  it.each(["dose.wiki", "www.dose.wiki", "DOSE.WIKI:443"])(
    "approves configured public host %s",
    (host) => {
      expect(isApprovedAnalyticsHost(host)).toBe(true);
    },
  );
});

describe("PostHog host and key gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadPolicyWithKey(key: string | undefined) {
    if (key === undefined) {
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    } else {
      vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", key);
    }
    vi.resetModules();
    return import("./analyticsHostPolicy");
  }

  it("stays disabled on every host when no project key is configured", async () => {
    const { isPostHogEnabled } = await loadPolicyWithKey(undefined);

    for (const host of ["dose.wiki", "www.dose.wiki", "dosewiki-admin.vercel.app", "localhost"]) {
      expect(isPostHogEnabled(host)).toBe(false);
    }
  });

  it("enables only the approved public hosts once a project key is configured", async () => {
    const { isPostHogEnabled } = await loadPolicyWithKey("phc_test_key");

    expect(isPostHogEnabled("dose.wiki")).toBe(true);
    expect(isPostHogEnabled("www.dose.wiki")).toBe(true);
    expect(isPostHogEnabled("DOSE.WIKI:443")).toBe(true);
  });

  it.each([
    "dosewiki-admin.vercel.app",
    "dosewiki-admin-git-security-example.vercel.app",
    "localhost",
    "127.0.0.1",
    "dose.wiki.example.com",
  ])("keeps PostHog off authenticated or preview host %s even with a key", async (host) => {
    const { isPostHogEnabled } = await loadPolicyWithKey("phc_test_key");

    expect(isPostHogEnabled(host)).toBe(false);
  });
});
