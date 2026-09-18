import { beforeEach, describe, expect, it, type Mock } from "vitest";

/**
 * The two public molecule image routes (substance `/api/molecules/[slug]` and class
 * `/api/molecules/classes/[key]`) share one contract; each test file supplies the
 * route's identity and this suite asserts everything else.
 *
 * Colorway byte transforms are owned by src/data/mappings/moleculePalette.test.ts;
 * here we only prove the route delegates the requested colorway.
 */
export type MoleculeImageRouteIdentity<Params extends Record<string, string>> = {
  /** Builds the route URL for a param value, e.g. ("lsd") => "https://dose.wiki/api/molecules/lsd". */
  url: (param: string, query?: string) => string;
  /** Wraps the param into the handler's params shape. */
  params: (param: string) => Params;
  /** The Postgres slug the route asks for when the param is `valid`. */
  dataSlugFor: (param: string) => string;
  valid: string;
  invalid: string;
};

type Handler<Params extends Record<string, string>> = (
  request: Request,
  context: { params: Promise<Params> },
) => Promise<Response>;

export function describeMoleculeImageRoute<Params extends Record<string, string>>(
  label: string,
  identity: MoleculeImageRouteIdentity<Params>,
  mocks: { enforceRateLimit: Mock; query: Mock },
  getHandler: () => Handler<Params>,
) {
  const BRAND_SVG = '<svg><path stroke="#F0ABFC"/><path stroke="#FDA4AF"/></svg>';
  const REVISION = "2026-09-07T12:34:56.789Z";
  const versionQuery = `?v=${encodeURIComponent(REVISION)}`;

  function call(param: string, query = "") {
    return getHandler()(new Request(identity.url(param, query)), {
      params: Promise.resolve(identity.params(param)),
    });
  }

  describe(`${label} (shared molecule image contract)`, () => {
    beforeEach(() => {
      mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
      mocks.query.mockReset().mockImplementation(async (_reference, { slug }) =>
        slug === identity.dataSlugFor(identity.valid)
          ? { svg: BRAND_SVG, updatedAt: REVISION }
          : null,
      );
    });

    it("returns the rate limiter's response before reading Postgres", async () => {
      mocks.enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

      const response = await call(identity.valid);

      expect(response.status).toBe(429);
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("rejects a param outside the slug grammar with 400 before reading Postgres", async () => {
      const response = await call(identity.invalid);

      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("bounds identifiers before a cache or Postgres lookup", async () => {
      const response = await call("a".repeat(129));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("maps a Postgres failure to 502 without leaking the error", async () => {
      mocks.query.mockRejectedValue(new Error("ECONNRESET secret-host"));

      const response = await call(identity.valid);

      expect(response.status).toBe(502);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain("secret-host");
    });

    it("answers 404 when no override row exists", async () => {
      mocks.query.mockResolvedValue(null);

      const response = await call(identity.valid);

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("serves sandboxed, nosniff SVG bytes", async () => {
      const response = await call(identity.valid);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
      expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("freezes only the saved revision and keeps unversioned URLs short-lived", async () => {
      const versioned = await call(identity.valid, `${versionQuery}&colorway=brand`);
      expect(versioned.status).toBe(200);
      expect(await versioned.text()).toBe(BRAND_SVG);
      expect(versioned.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, s-maxage=31536000, immutable",
      );

      const fresh = await call(identity.valid, "?colorway=pro-dark");
      expect(fresh.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60, must-revalidate");
    });

    it.each(["", "1", "garbage", "2026-02-30T12:00:00.000Z", "x".repeat(256), `${encodeURIComponent(REVISION)}&v=${encodeURIComponent(REVISION)}`])(
      "rejects unsupported or ambiguous version %s before lookup",
      async (version) => {
        const response = await call(identity.valid, `?v=${version}`);
        expect(response.status).toBe(400);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(mocks.query).not.toHaveBeenCalled();
      },
    );

    it("never serves newer bytes under an old revision URL", async () => {
      mocks.query.mockResolvedValue({
        svg: '<svg id="new-revision"/>',
        updatedAt: "2026-09-08T12:34:56.789Z",
      });
      const response = await call(identity.valid, versionQuery);
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain("<svg");
    });

    it("does not cache a missing version or transient version lookup failure", async () => {
      mocks.query.mockResolvedValueOnce(null);
      const missing = await call(identity.valid, versionQuery);
      expect(missing.status).toBe(404);
      expect(missing.headers.get("Cache-Control")).toBe("no-store");
      mocks.query.mockRejectedValueOnce(new Error("transport unavailable"));
      const failed = await call(identity.valid, versionQuery);
      expect(failed.status).toBe(502);
      expect(failed.headers.get("Cache-Control")).toBe("no-store");
      const recovered = await call(identity.valid, versionQuery);
      expect(recovered.status).toBe(200);
      expect(recovered.headers.get("Cache-Control")).toContain("immutable");
    });

    it("passes the requested colorway to the palette and leaves brand bytes untouched", async () => {
      const brand = await call(identity.valid, `${versionQuery}&colorway=brand`);
      expect(await brand.text()).toBe(BRAND_SVG);

      const pro = await call(identity.valid, `${versionQuery}&colorway=pro-dark`);
      const bytes = await pro.text();
      expect(bytes).not.toBe(BRAND_SVG);
      expect(bytes).not.toContain("#F0ABFC");
    });
  });
}
