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
  /** The Convex slug the route asks for when the param is `valid`. */
  convexSlugFor: (param: string) => string;
  valid: string;
  invalid: string;
  errors: { invalid: string; lookupFailed: string; missing: string };
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

  function call(param: string, query = "") {
    return getHandler()(new Request(identity.url(param, query)), {
      params: Promise.resolve(identity.params(param)),
    });
  }

  describe(`${label} (shared molecule image contract)`, () => {
    beforeEach(() => {
      mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
      mocks.query.mockReset().mockResolvedValue({ svg: BRAND_SVG });
    });

    it("returns the rate limiter's response before reading Convex", async () => {
      mocks.enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

      const response = await call(identity.valid);

      expect(response.status).toBe(429);
      expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "publicProxyRead");
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("rejects a param outside the slug grammar with 400 before reading Convex", async () => {
      const response = await call(identity.invalid);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: identity.errors.invalid });
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("asks Convex for the route's own override slug", async () => {
      await call(identity.valid);

      expect(mocks.query).toHaveBeenCalledTimes(1);
      expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
        slug: identity.convexSlugFor(identity.valid),
      });
    });

    it("maps a Convex failure to 502 without leaking the error", async () => {
      mocks.query.mockRejectedValue(new Error("ECONNRESET secret-host"));

      const response = await call(identity.valid);

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: identity.errors.lookupFailed });
    });

    it("answers 404 when no override row exists", async () => {
      mocks.query.mockResolvedValue(null);

      const response = await call(identity.valid);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: identity.errors.missing });
    });

    it("serves sandboxed, nosniff SVG bytes", async () => {
      const response = await call(identity.valid);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
      expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("freezes versioned URLs and keeps unversioned ones short-lived", async () => {
      const versioned = await call(identity.valid, "?v=1&colorway=pro-dark");
      expect(versioned.headers.get("Cache-Control")).toBe(
        "public, max-age=31536000, s-maxage=31536000, immutable",
      );

      const fresh = await call(identity.valid, "?colorway=pro-dark");
      expect(fresh.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60, must-revalidate");
    });

    it("passes the requested colorway to the palette and leaves brand bytes untouched", async () => {
      const brand = await call(identity.valid, "?colorway=brand");
      expect(await brand.text()).toBe(BRAND_SVG);

      const pro = await call(identity.valid, "?colorway=pro-dark");
      const bytes = await pro.text();
      expect(bytes).not.toBe(BRAND_SVG);
      expect(bytes).not.toContain("#F0ABFC");
    });
  });
}
