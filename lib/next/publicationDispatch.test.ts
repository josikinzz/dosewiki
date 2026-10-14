import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchPublicationSignal, getPublicationTargets } from "./publicationDispatch";
import { PUBLICATION_SIGNATURE_HEADER } from "./publicationWire";
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

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
});
