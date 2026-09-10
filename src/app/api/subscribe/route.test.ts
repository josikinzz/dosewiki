import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getDataBackend: vi.fn(() => "convex" as const),
  fetch: vi.fn(),
}));

vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: mocks.getDataBackend }));
vi.mock("@server/convex/runtimeTargets", () => ({
  getConvexDeploymentName: () => "glad-minnow-656",
  getPrivilegedWriteTarget: () => ({ selectedUrl: "https://glad-minnow-656.convex.cloud" }),
}));
vi.mock("@server/convex/serverWriteCapability", () => ({ getPublicIntakeWriteCapability: () => null }));

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("https://dose.wiki/api/subscribe", {
    method: "POST",
    headers: { Origin: "https://dose.wiki", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/subscribe under DATA_WRITES_FROZEN", () => {
  afterEach(() => {
    delete process.env.DATA_WRITES_FROZEN;
    vi.unstubAllGlobals();
  });

  it("refuses with 503 before forwarding to the Convex action, which the freeze cannot reach", async () => {
    process.env.DATA_WRITES_FROZEN = "1";
    vi.stubGlobal("fetch", mocks.fetch);

    const response = await POST(post({ email: "someone@example.com", list: "dosewiki" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
