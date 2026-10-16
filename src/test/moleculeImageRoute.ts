import { beforeEach, describe, expect, it, type Mock } from "vitest";

export type MoleculeImageRouteIdentity<Params extends Record<string, string>> = {
  /** Builds the route URL for a param value, e.g. ("lsd") => "https://dose.wiki/api/molecules/lsd". */
  url: (param: string, query?: string) => string;
  /** Wraps the param into the handler's params shape. */
  params: (param: string) => Params;
  /** The Postgres slug the route asks for when the param is `valid`. */
  dataSlugFor: (param: string) => string;
  valid: string;
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

    it("maps a Postgres failure to 502 without leaking the error", async () => {
      mocks.query.mockRejectedValue(new Error("ECONNRESET secret-host"));

      const response = await call(identity.valid);

      expect(response.status).toBe(502);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain("secret-host");
    });

    it("serves sandboxed, nosniff SVG bytes", async () => {
      const response = await call(identity.valid);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
      expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });
}
