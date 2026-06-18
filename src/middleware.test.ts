import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

function makeRequest(path: string): NextRequest {
  return new NextRequest(new Request(`https://dosewiki-admin.vercel.app${path}`));
}

function makePublicRequest(path: string): NextRequest {
  return new NextRequest(new Request(`https://dose.wiki${path}`));
}

describe("middleware role policy adapter", () => {
  beforeEach(() => {
    mocks.getToken.mockReset();
  });

  it("redirects anonymous /dev requests to sign in", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev",
    );
  });

  it("allows authenticated viewers into /dev/profile", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profile"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows authenticated viewers into /dev/profiles", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profiles"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects viewers away from the editor shell", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/unauthorized?from=%2Fdev",
    );
  });

  it("allows editors into the editor shell", async () => {
    mocks.getToken.mockResolvedValue({ email: "editor@example.com", role: "editor" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows public dose.wiki article routes through middleware", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
