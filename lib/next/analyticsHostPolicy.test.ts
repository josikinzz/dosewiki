import { afterEach, describe, expect, it } from "vitest";
import {
  ANALYTICS_SCRIPT_ID,
  ANALYTICS_SCRIPT_SRC,
  attachApprovedAnalytics,
  isApprovedAnalyticsHost,
} from "./analyticsHostPolicy";

afterEach(() => {
  document.getElementById(ANALYTICS_SCRIPT_ID)?.remove();
});

describe("analytics host script boundary", () => {
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

  it("does not emit a remote script for the admin host", () => {
    attachApprovedAnalytics({ document, host: "dosewiki-admin.vercel.app" });

    expect(document.querySelector(`script[src="${ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });

  it("does not emit a remote script for a Vercel preview host", () => {
    attachApprovedAnalytics({
      document,
      host: "dosewiki-admin-git-security-josikinzz.vercel.app",
    });

    expect(document.querySelector(`script[src="${ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });

  it("emits the approved analytics script once on a configured public host", () => {
    const first = attachApprovedAnalytics({ document, host: "dose.wiki", nonce: "public-nonce" });
    const second = attachApprovedAnalytics({ document, host: "dose.wiki", nonce: "public-nonce" });
    const script = document.getElementById(ANALYTICS_SCRIPT_ID);

    expect(first).toBe(script);
    expect(second).toBe(script);
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect(script?.getAttribute("src")).toBe(ANALYTICS_SCRIPT_SRC);
    expect(script?.getAttribute("nonce")).toBe("public-nonce");
    expect(script?.getAttribute("data-domains")).toBe("dose.wiki,www.dose.wiki");
    expect(document.querySelectorAll(`#${ANALYTICS_SCRIPT_ID}`)).toHaveLength(1);
  });
});
