import { describe, expect, it, vi } from "vitest";
import { DataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { authorizeCronRequest, cronRoute, withCronWriteFreeze } from "./cronAuthorization";

describe("authorizeCronRequest", () => {
  it("refuses to run when CRON_SECRET is unset", () => {
    expect(authorizeCronRequest("Bearer anything", {})).toMatchObject({
      allowed: false,
      status: 503,
    });
  });

  it("requires the exact bearer secret", () => {
    const env = { CRON_SECRET: "s3cret" };
    expect(authorizeCronRequest(null, env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeCronRequest("Bearer wrong", env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeCronRequest("s3cret", env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeCronRequest("Bearer s3cret", env)).toMatchObject({ allowed: true });
  });

  it("refuses a wrong secret of equal length", () => {
    const env = { CRON_SECRET: "s3cret" };

    expect(authorizeCronRequest("Bearer s3creT", env)).toMatchObject({ allowed: false, status: 401 });
  });

  it("refuses a wrong secret of different length, shorter or longer", () => {
    const env = { CRON_SECRET: "s3cret" };

    expect(authorizeCronRequest("Bearer s3cre", env)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeCronRequest("Bearer s3cret-and-more", env)).toMatchObject({
      allowed: false,
      status: 401,
    });
  });

  it("allows the correct secret, including multibyte secrets", () => {
    expect(authorizeCronRequest("Bearer s3cret", { CRON_SECRET: "s3cret" })).toMatchObject({
      allowed: true,
      status: 200,
    });
    expect(authorizeCronRequest("Bearer s\u00e9cret", { CRON_SECRET: "s\u00e9cret" })).toMatchObject({
      allowed: true,
    });
    expect(authorizeCronRequest("Bearer secrete", { CRON_SECRET: "s\u00e9cret" })).toMatchObject({
      allowed: false,
      status: 401,
    });
  });
});

describe("withCronWriteFreeze", () => {
  const request = () => new Request("https://editor.dose.wiki/api/cron/fixture");

  it("passes the handler response through when nothing is frozen", async () => {
    const handler = withCronWriteFreeze(async () => Response.json({ ok: true }));

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("reports a write freeze as 503 with frozen: true instead of a 500", async () => {
    const handler = withCronWriteFreeze(async () => {
      throw new DataWriteFrozenError("fixture:write");
    });

    const response = await handler(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ frozen: true });
  });

  it("rethrows any other failure", async () => {
    const handler = withCronWriteFreeze(async () => {
      throw new Error("database unreachable");
    });

    await expect(handler(request())).rejects.toThrow("database unreachable");
  });
});

describe("cronRoute", () => {
  const request = (authorization?: string) =>
    new Request("https://editor.dose.wiki/api/cron/x", { headers: authorization ? { authorization } : {} });

  it("runs the handler only for the configured bearer secret", async () => {
    const handler = vi.fn(async () => Response.json({ ran: true }));
    const route = cronRoute(handler, { env: () => ({ CRON_SECRET: "s3cret" }) });

    expect((await route(request("Bearer wrong"))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect((await route(request("Bearer s3cret"))).status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("reports a write freeze from the handler as a deliberate 503", async () => {
    const route = cronRoute(async () => { throw new DataWriteFrozenError("x"); }, { env: () => ({ CRON_SECRET: "s3cret" }) });
    const response = await route(request("Bearer s3cret"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ frozen: true });
  });

  it("spends the rate limit before authorizing, so wrong secrets are bounded too", async () => {
    const limited = Response.json({ error: "Too many requests." }, { status: 429 });
    const rateLimit = vi.fn(async () => limited);
    const handler = vi.fn(async () => Response.json({ ran: true }));
    const route = cronRoute(handler, { env: () => ({}), rateLimit });

    const response = await route(request("Bearer wrong"));
    expect(response.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});
