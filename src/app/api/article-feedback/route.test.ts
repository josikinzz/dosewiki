import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
  getClientIp: vi.fn((request: Request) => request.headers.get("x-forwarded-for") ?? "unknown"),
}));

const mocks = vi.hoisted(() => ({
  storeCreate: vi.fn(),
  getPublicArticleFeedbackStore: vi.fn(),
}));

vi.mock("@/features/article/feedback/articleFeedbackStore.server", () => {
  class ArticleFeedbackValidationError extends Error {
    constructor(readonly errors: string[]) {
      super(errors.join(" "));
      this.name = "ArticleFeedbackValidationError";
    }
  }

  return {
    getPublicArticleFeedbackStore: mocks.getPublicArticleFeedbackStore,
    getArticleFeedbackIpHashSecret: () => "hash-secret",
    ArticleFeedbackStorageConfigurationError: class ArticleFeedbackStorageConfigurationError extends Error {},
    ArticleFeedbackValidationError,
  };
});

const validBody = {
  substance_slug: "mescaline",
  substance_title: "Mescaline",
  category: "inaccurate",
  importance: "normal",
  details: "The oral duration looks off; recent sources list a longer offset.",
  source_url: "https://pubmed.example/study",
  contact_email: "reader@example.com",
  website: "",
};

describe("article feedback public route", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.storeCreate.mockReset();
    mocks.getPublicArticleFeedbackStore.mockReset();
    mocks.getPublicArticleFeedbackStore.mockResolvedValue({
      create: mocks.storeCreate,
    });
    mocks.storeCreate.mockResolvedValue({
      id: "feedback-1",
      status: "new",
    });
  });

  it("rate-limits and stores valid public feedback without exposing review state", async () => {
    const { enforceRateLimit } = await import("@server/http/nextRateLimit");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/article-feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "user-agent": "vitest",
        },
        body: JSON.stringify(validBody),
      }),
    );

    expect(enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicArticleFeedbackSubmit");
    expect(mocks.storeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        substance_slug: "mescaline",
        substance_title: "Mescaline",
        category: "inaccurate",
        importance: "normal",
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

    await POST(
      new Request("https://dose.wiki/api/article-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, website: "https://spam.example" }),
      }),
    );

    expect(mocks.storeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ honeypot: "https://spam.example" }),
      expect.anything(),
    );
  });

  it("returns field errors when validation fails", async () => {
    const { ArticleFeedbackValidationError } = await import(
      "@/features/article/feedback/articleFeedbackStore.server"
    );
    mocks.storeCreate.mockRejectedValue(
      new ArticleFeedbackValidationError(["Details are required — tell us what should change."]),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://dose.wiki/api/article-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, details: "" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Feedback validation failed.",
      errors: ["Details are required — tell us what should change."],
    });
  });
});
