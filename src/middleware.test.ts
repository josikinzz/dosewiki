import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: mocks.getToken,
}));

function makeRequest(path: string): NextRequest {
  return new NextRequest(
    new Request(`https://dosewiki-admin.vercel.app${path}`, {
      headers: { host: "dosewiki-admin.vercel.app" },
    }),
  );
}

function makePublicRequest(path: string): NextRequest {
  return new NextRequest(
    new Request(`https://dose.wiki${path}`, {
      headers: { host: "dose.wiki" },
    }),
  );
}

describe("middleware role policy adapter", () => {
  beforeEach(() => {
    mocks.getToken.mockReset();
  });

  it("allows anonymous /dev requests to view the tools shell", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects anonymous profile requests to sign in", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev/profile"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://dosewiki-admin.vercel.app/sign-in?callbackUrl=%2Fdev%2Fprofile",
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

  it("allows viewers to inspect the editor shell without editor privileges", async () => {
    mocks.getToken.mockResolvedValue({ email: "viewer@example.com", role: "viewer" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows editors into the editor shell", async () => {
    mocks.getToken.mockResolvedValue({ email: "editor@example.com", role: "editor" });
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/dev"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects public dose.wiki article routes to the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/fentanyl"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("redirects public dose.wiki API routes to the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/api/search-suggestions?q=mdma"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://dose.wiki/");
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows public dose.wiki static assets for the construction homepage", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makePublicRequest("/icon-512.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("allows full public article routes on the admin Vercel host", async () => {
    const { middleware } = await import("../middleware");

    const response = await middleware(makeRequest("/fentanyl"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
