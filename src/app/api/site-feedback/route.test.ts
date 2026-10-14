import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn((request: Request) => request.headers.get("x-forwarded-for") ?? "unknown"),
}));

const mocks = vi.hoisted(() => ({
  storeCreate: vi.fn(),
  getPublicSiteFeedbackStore: vi.fn(),
}));

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => ({
  getPublicSiteFeedbackStore: mocks.getPublicSiteFeedbackStore,
  getSiteFeedbackIpHashSecret: () => "hash-secret",
  SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
  SiteFeedbackValidationError: class SiteFeedbackValidationError extends Error {},
}));

const validBody = {
  category: "technical",
  urgency: "normal",
  details: "The search box loses focus after every keystroke on Firefox.",
  page: "/category/psychedelics",
  email: "reader@example.com",
  website: "",
};

function makeRequest(body: unknown): Request {
  return new Request("https://dose.wiki/api/site-feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  });
}

describe("site feedback public route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.storeCreate.mockReset().mockResolvedValue({ id: "feedback-1", status: "new" });
    mocks.getPublicSiteFeedbackStore.mockReset().mockResolvedValue({ create: mocks.storeCreate });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a missing or failed Turnstile token with a 400 before store-create", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const fetchSpy = vi.fn(async () => Response.json({ success: false }));
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("./route");

    const missing = await POST(makeRequest(validBody));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({
      error: "Captcha verification failed.",
      errors: ["Captcha verification failed."],
    });

    const failed = await POST(makeRequest({ ...validBody, turnstileToken: "tok-bad" }));
    expect(failed.status).toBe(400);
    expect(mocks.storeCreate).not.toHaveBeenCalled();
  });

  it("fails closed when siteverify is unreachable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ ...validBody, turnstileToken: "tok-1" }));

    expect(response.status).toBe(400);
    expect(mocks.storeCreate).not.toHaveBeenCalled();
  });
});
