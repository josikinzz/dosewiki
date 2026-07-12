import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ANALYTICS_SCRIPT_SRC } from "@server/next/analyticsHostPolicy";
import { ApprovedPublicAnalytics } from "./ApprovedPublicAnalytics";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll(`script[src="${ANALYTICS_SCRIPT_SRC}"]`).forEach((script) => script.remove());
});

describe("ApprovedPublicAnalytics", () => {
  it.each([
    "dosewiki-admin.vercel.app",
    "dosewiki-admin-git-review-josikinzz.vercel.app",
  ])("keeps remote analytics out of rendered %s pages", (host) => {
    render(<ApprovedPublicAnalytics host={host} />);

    expect(document.querySelector(`script[src="${ANALYTICS_SCRIPT_SRC}"]`)).toBeNull();
  });

  it("retains analytics on the explicitly approved public host", () => {
    render(<ApprovedPublicAnalytics host="dose.wiki" nonce="public-nonce" />);

    const script = document.querySelector(`script[src="${ANALYTICS_SCRIPT_SRC}"]`);
    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect(script?.getAttribute("nonce")).toBe("public-nonce");
  });
});
