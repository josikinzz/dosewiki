import { describe, expect, it } from "vitest";
import { authorizeCronRequest } from "./cronAuthorization";

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
});
