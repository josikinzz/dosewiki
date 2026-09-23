import { describe, expect, it } from "vitest";
import { DataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { authorizeCronRequest, withCronWriteFreeze } from "./cronAuthorization";

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
