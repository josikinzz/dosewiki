import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PUBLICATION_RECEIVER_PATH,
  dispatchPublicationSignal,
  getPublicationTargets,
} from "./publicationDispatch";
import { PUBLICATION_SIGNATURE_HEADER, parsePublicationSignal } from "./publicationWire";
import { verifyPublicationSignature } from "./publicationSignature";

const SECRET = "publication-secret-that-is-long-enough";

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    PUBLIC_CACHE_PUBLISH_SECRET: SECRET,
    PUBLIC_CACHE_PUBLISH_TARGETS: "https://dose.wiki,https://www.effectindex.com",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("publication targets", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps configured public origins and drops everything else", () => {
    const targets = getPublicationTargets(
      env({
        PUBLIC_CACHE_PUBLISH_TARGETS: [
          "https://dose.wiki",
          "https://attacker.example.com",
          "http://dose.wiki",
          "https://dev.dose.wiki",
          "not a url",
          "https://dose.wiki/api/other",
        ].join(","),
      }),
    );

    expect(targets).toEqual(["https://dose.wiki"]);
  });

  it("allows a local receiver only outside production", () => {
    const local = { PUBLIC_CACHE_PUBLISH_TARGETS: "http://localhost:3000" };

    expect(getPublicationTargets(env({ ...local, NODE_ENV: "development" }))).toEqual([
      "http://localhost:3000",
    ]);
    expect(getPublicationTargets(env(local))).toEqual([]);
  });
});

describe("publication dispatch", () => {
  const fetchMock = vi.fn();
  const acknowledge = (_url: string, init: RequestInit) => Promise.resolve(Response.json({
    ok: true, dispatchId: JSON.parse(init.body as string).dispatchId,
  }));

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delivers one signed, parseable signal per configured public origin", async () => {
    fetchMock.mockImplementation(acknowledge);

    const receipts = await dispatchPublicationSignal(
      [{ kind: "article", slug: "2c-b" }],
      "save-article",
      env(),
    );

    expect(receipts.map((receipt) => [receipt.target, receipt.status])).toEqual([
      ["https://dose.wiki", "accepted"],
      ["https://www.effectindex.com", "accepted"],
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://dose.wiki${PUBLICATION_RECEIVER_PATH}`);
    const body = init.body as string;
    expect(verifyPublicationSignature(body, init.headers[PUBLICATION_SIGNATURE_HEADER], SECRET)).toBe(true);
    const parsed = parsePublicationSignal(JSON.parse(body));
    expect(parsed.status === "accepted" && parsed.signal.targets).toEqual([{ kind: "article", slug: "2c-b" }]);
  });

  it("signs the exact bytes it sends, so an edited body fails verification", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await dispatchPublicationSignal([{ kind: "about" }], "manual", env());

    const [, init] = fetchMock.mock.calls[0];
    const tampered = (init.body as string).replace("about", "copy");
    expect(verifyPublicationSignature(tampered, init.headers[PUBLICATION_SIGNATURE_HEADER], SECRET)).toBe(
      false,
    );
  });

  it("reports a refused target without retrying its rejection", async () => {
    fetchMock.mockResolvedValue(new Response("unknown_target", { status: 400 }));

    const receipts = await dispatchPublicationSignal(
      [{ kind: "article", slug: "lsd" }],
      "save-article",
      env({ PUBLIC_CACHE_PUBLISH_TARGETS: "https://dose.wiki" }),
    );

    expect(receipts).toMatchObject([
      {
        target: "https://dose.wiki",
        status: "rejected",
        attempts: 1,
        httpStatus: 400,
        detail: "unknown_target",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries an unreachable target once and reports it unpublished", async () => {
    fetchMock.mockRejectedValue(new Error("connect ETIMEDOUT"));

    const receipts = await dispatchPublicationSignal(
      [{ kind: "article", slug: "lsd" }],
      "save-article",
      env({ PUBLIC_CACHE_PUBLISH_TARGETS: "https://dose.wiki" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(receipts[0]).toMatchObject({ status: "unreachable", attempts: 2 });
  });

  it("recovers when the retry succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("cold start", { status: 503 }))
      .mockImplementationOnce(acknowledge);

    const receipts = await dispatchPublicationSignal(
      [{ kind: "article", slug: "lsd" }],
      "save-article",
      env({ PUBLIC_CACHE_PUBLISH_TARGETS: "https://dose.wiki" }),
    );

    expect(receipts[0]).toMatchObject({ status: "accepted", attempts: 2 });
  });

  it("reports an unconfigured pair instead of sending anything", async () => {
    const missingSecret = await dispatchPublicationSignal(
      [{ kind: "about" }],
      "manual",
      env({ PUBLIC_CACHE_PUBLISH_SECRET: undefined }),
    );
    const missingTargets = await dispatchPublicationSignal(
      [{ kind: "about" }],
      "manual",
      env({ PUBLIC_CACHE_PUBLISH_TARGETS: undefined }),
    );

    expect(missingSecret[0].status).toBe("unconfigured");
    expect(missingTargets[0].status).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never treats a successful unrelated HTTP response as invalidation acceptance", async () => {
    fetchMock.mockImplementation(async () => Response.json({ ok: true, dispatchId: "another-operation" }));
    const receipts = await dispatchPublicationSignal([{ kind: "article", slug: "lsd" }], "manual", env());
    expect(receipts.every((receipt) => receipt.status === "rejected")).toBe(true);
  });

  it("distinguishes accepted invalidation from the revision actually served by each public origin", async () => {
    const revision = "a".repeat(64);
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (init.method === "POST") return acknowledge(url, init);
      const observed = url.startsWith("https://dose.wiki/") ? revision : "b".repeat(64);
      return Promise.resolve(new Response(`<meta name="dosewiki-public-revision" content="${observed}">`));
    });
    const receipts = await dispatchPublicationSignal(
      [{ kind: "article", slug: "lsd" }], "save-article", env(), [{ slug: "lsd", revision }],
    );
    expect(receipts.map(({ status, verification }) => ({ status, verification }))).toEqual([
      { status: "accepted", verification: "verified" },
      { status: "accepted", verification: "incomplete" },
    ]);
    expect(receipts[1].servedRevisions?.[0]).toMatchObject({ status: "mismatch", observedRevision: "b".repeat(64) });
  });

  it("verifies deletion only on a real 404, not a successful soft-not-found page", async () => {
    fetchMock.mockImplementation((url: string, init: RequestInit) => init.method === "POST"
      ? acknowledge(url, init)
      : Promise.resolve(new Response("Not found", { status: url.startsWith("https://dose.wiki/") ? 404 : 200 })));
    const receipts = await dispatchPublicationSignal(
      [{ kind: "article", slug: "removed" }], "manual", env(), [{ slug: "removed", revision: null }],
    );
    expect(receipts.map((receipt) => receipt.verification)).toEqual(["verified", "incomplete"]);
  });

  it("splits a write with more identities than one signal may carry", async () => {
    fetchMock.mockImplementation(acknowledge);
    const targets = Array.from({ length: 150 }, (_, index) => ({
      kind: "article" as const,
      slug: `article-${index}`,
    }));

    const receipts = await dispatchPublicationSignal(
      targets,
      "save-article",
      env({ PUBLIC_CACHE_PUBLISH_TARGETS: "https://dose.wiki" }),
    );

    expect(receipts).toHaveLength(3);
    expect(receipts.every((receipt) => receipt.status === "accepted")).toBe(true);
    const delivered = fetchMock.mock.calls.flatMap(
      ([, init]) => JSON.parse(init.body as string).targets as { slug: string }[],
    );
    expect(delivered.map((target) => target.slug)).toEqual(targets.map((target) => target.slug));
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(init.body as string);
      expect(parsePublicationSignal(body).status).toBe("accepted");
    }
  });

  it("sends nothing when a write produced no public identity", async () => {
    expect(await dispatchPublicationSignal([], "manual", env())).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
