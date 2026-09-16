import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NextCache from "next/cache";
import { revalidatePath, revalidateTag } from "next/cache";
import { signPublicationBody } from "@server/next/publicationSignature";
import { PUBLICATION_SIGNAL_VERSION } from "@server/next/publicationWire";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const warmMocks = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ slug: "2c-b", name: "2C-B", priority: "high" }]),
  warmUrls: vi.fn(async (urls: string[]) => ({
    results: urls.map((url) => ({
      url,
      ok: true,
      durationMs: 1,
      error: null,
      representations: {
        html: {
          representation: "html",
          ok: true,
          status: 200,
          cache: "hit",
          durationMs: 1,
        },
        navigation: {
          representation: "navigation",
          ok: true,
          status: 200,
          cache: "hit",
          durationMs: 1,
        },
      },
    })),
    remaining: [],
  })),
  background: [] as Promise<unknown>[],
}));

vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    after: vi.fn((callback: () => Promise<unknown>) => {
      warmMocks.background.push(callback());
    }),
  };
});

vi.mock("@server/data/publicData", () => ({
  getPublicSubstanceLookup: warmMocks.lookup,
}));

vi.mock(
  "../../../../../scripts/deploy/warm-public-routes.lib.mjs",
  async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
    return { ...original, warmUrls: warmMocks.warmUrls };
  },
);
const SECRET = "publication-secret-that-is-long-enough";

async function signedRequest(
  body: unknown,
  options: { secret?: string | null; signature?: string; url?: string } = {},
) {
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  const signature =
    options.signature ??
    signPublicationBody(serialized, options.secret ?? SECRET);
  return new Request(
    options.url ?? "https://dose.wiki/api/public-cache/revalidate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dosewiki-publication-signature": signature,
      },
      body: serialized,
    },
  );
}

function signal(overrides: Record<string, unknown> = {}) {
  return {
    version: PUBLICATION_SIGNAL_VERSION,
    source: "save-article",
    issuedAt: Date.now(),
    dispatchId: "dispatch-0001",
    targets: [{ kind: "article", slug: "2c-b" }],
    ...overrides,
  };
}

describe("public cache publication receiver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.PUBLIC_CACHE_PUBLISH_SECRET = SECRET;
    warmMocks.lookup.mockResolvedValue([
      { slug: "2c-b", name: "2C-B", priority: "high" },
    ]);
    warmMocks.warmUrls.mockClear();
    warmMocks.background.length = 0;
  });

  it("refuses every request when no shared secret is configured", async () => {
    delete process.env.PUBLIC_CACHE_PUBLISH_SECRET;

    const response = await POST(await signedRequest(signal()));

    expect(response.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses an unsigned or wrongly signed body without touching the cache", async () => {
    const wrongSecret = await POST(
      await signedRequest(signal(), {
        secret: "a-different-shared-secret-value",
      }),
    );
    const noSignature = await POST(
      await signedRequest(signal(), { signature: "" }),
    );

    expect(wrongSecret.status).toBe(401);
    expect(noSignature.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses a signature that covers different bytes than the body", async () => {
    const original = JSON.stringify(signal());
    const tampered = original.replace("2c-b", "lsd");
    const response = await POST(
      await signedRequest(tampered, {
        signature: signPublicationBody(original, SECRET),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("expires exactly the identities it was sent", async () => {
    const response = await POST(await signedRequest(signal()));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      dispatchId: "dispatch-0001",
      applied: { paths: ["/2c-b", "/zh/2c-b"] },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/2c-b");
    expect(revalidatePath).toHaveBeenCalledWith("/zh/2c-b");
    const expired = vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag);
    expect(expired).toContain("data-public:substances:2c-b");
    expect(expired).not.toContain("data-public");
  });
  it("warms only public affected routes and reports the navigation work", async () => {
    const response = await POST(
      await signedRequest(
        signal({
          targets: [
            { kind: "article", slug: "2c-b" },
            { kind: "article", slug: "hidden" },
            { kind: "article-translation", slug: "2c-b", locale: "zh-Hans" },
          ],
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      warming: { status: "scheduled", candidates: 3 },
    });
    await Promise.all(warmMocks.background);
    expect(warmMocks.warmUrls).toHaveBeenCalledWith(
      ["https://dose.wiki/2c-b", "https://dose.wiki/zh/2c-b"],
      expect.objectContaining({ concurrency: 4, retries: 0 }),
    );
  });

  it("does not schedule warming for a public hostname on an unapproved origin", async () => {
    const response = await POST(
      await signedRequest(signal(), {
        url: "https://dose.wiki:8443/api/public-cache/revalidate",
      }),
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      warming: { status: "skipped", reason: "receiver_origin_not_allowed" },
    });
    expect(warmMocks.background).toHaveLength(0);
  });

  it("refuses an identity it cannot map instead of expiring everything", async () => {
    const response = await POST(
      await signedRequest(signal({ targets: [{ kind: "everything" }] })),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unknown_target",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("refuses a signal from the previous wire version", async () => {
    const response = await POST(await signedRequest(signal({ version: 1 })));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unsupported_version",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses a replayed capture from outside the skew window", async () => {
    const response = await POST(
      await signedRequest(signal({ issuedAt: Date.now() - 3_600_000 })),
    );

    expect(response.status).toBe(409);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("treats a duplicate and an out-of-order delivery as another expiry, never a restore", async () => {
    const newer = await POST(
      await signedRequest(signal({ dispatchId: "dispatch-0002" })),
    );
    const older = await POST(
      await signedRequest(
        signal({ dispatchId: "dispatch-0001", issuedAt: Date.now() - 30_000 }),
      ),
    );

    expect([newer.status, older.status]).toEqual([200, 200]);
    // Every call expires; no code path writes or restores a cached value.
    const expireOptions = vi
      .mocked(revalidateTag)
      .mock.calls.map(([, options]) => options);
    expect(expireOptions.length).toBeGreaterThan(0);
    expect(
      expireOptions.every(
        (options) => typeof options === "object" && options?.expire === 0,
      ),
    ).toBe(true);
  });

  it("refuses more identities than one editorial operation can touch", async () => {
    const targets = Array.from({ length: 100 }, (_, index) => ({
      kind: "article",
      slug: `article-${index}`,
    }));
    const response = await POST(await signedRequest(signal({ targets })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "too_many_targets",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before verifying or parsing it", async () => {
    const targets = Array.from({ length: 2_000 }, (_, index) => ({
      kind: "article",
      slug: `article-${index}`,
    }));
    const response = await POST(await signedRequest(signal({ targets })));

    expect(response.status).toBe(413);
  });

  it("never lets a receiver answer be cached", async () => {
    const response = await POST(await signedRequest(signal()));

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
