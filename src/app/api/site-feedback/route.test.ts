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

vi.mock("@/features/site-feedback/siteFeedbackStore.server", () => {
  class SiteFeedbackValidationError extends Error {
    constructor(readonly errors: string[]) {
      super(errors.join(" "));
      this.name = "SiteFeedbackValidationError";
    }
  }

  return {
    getPublicSiteFeedbackStore: mocks.getPublicSiteFeedbackStore,
    getSiteFeedbackIpHashSecret: () => "hash-secret",
    SiteFeedbackStorageConfigurationError: class SiteFeedbackStorageConfigurationError extends Error {},
    SiteFeedbackValidationError,
  };
});

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
    mocks.storeCreate.mockReset();
    mocks.getPublicSiteFeedbackStore.mockReset();
    mocks.getPublicSiteFeedbackStore.mockResolvedValue({
      create: mocks.storeCreate,
    });
    mocks.storeCreate.mockResolvedValue({
      id: "feedback-1",
      status: "new",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rate-limits and stores valid public feedback without exposing review state", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody));

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicSiteFeedbackSubmit");
    expect(mocks.storeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "technical",
        urgency: "normal",
        details: validBody.details,
        page: "/category/psychedelics",
        email: "reader@example.com",
        honeypot: "",
        user_agent: "vitest",
      }),
      expect.objectContaining({
        ip: "203.0.113.10",
        ip_hash_secret: "hash-secret",
      }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: "feedback-1",
      status: "received",
    });
  });

  it("routes the website honeypot field into the store input", async () => {
    const { POST } = await import("./route");

    await POST(makeRequest({ ...validBody, website: "https://spam.example" }));

    expect(mocks.storeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ honeypot: "https://spam.example" }),
      expect.anything(),
    );
  });

  it("returns field errors when validation fails", async () => {
    const { SiteFeedbackValidationError } = await import(
      "@/features/site-feedback/siteFeedbackStore.server"
    );
    mocks.storeCreate.mockRejectedValue(
      new SiteFeedbackValidationError(["Details are required — tell us what should change."]),
    );
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ ...validBody, details: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Feedback validation failed.",
      errors: ["Details are required — tell us what should change."],
    });
  });

  it("skips Turnstile verification when TURNSTILE_SECRET_KEY is unset", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("./route");

    const response = await POST(makeRequest(validBody));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(202);
  });

  it("verifies the Turnstile token via siteverify when the secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const fetchSpy = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("./route");

    const response = await POST(makeRequest({ ...validBody, turnstileToken: "tok-1" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const params = init.body as URLSearchParams;
    expect(params.get("secret")).toBe("test-secret");
    expect(params.get("response")).toBe("tok-1");
    expect(params.get("remoteip")).toBe("203.0.113.10");
    expect(response.status).toBe(202);
    expect(mocks.storeCreate).toHaveBeenCalled();
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
