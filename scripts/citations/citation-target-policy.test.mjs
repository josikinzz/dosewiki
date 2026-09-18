import { describe, expect, it } from "vitest";

import { assertCitationSourceIdentity, assertExplicitCitationPromotionTarget } from "./citation-target-policy.mjs";

function context(overrides = {}) {
  return {
    backend: "postgres",
    targetUrl: "postgresql://localhost:56549/postgres",
    targetUrlKey: "TARGET_POSTGRES_URL",
    deploymentFingerprint: "localhost/postgres",
    expectedDeployment: "localhost/postgres",
    ...overrides,
  };
}

describe("citation promotion target policy", () => {
  it("accepts explicit deployment-pinned Postgres targets", () => {
    expect(assertExplicitCitationPromotionTarget(context())).toBe(context().targetUrl);
    expect(assertExplicitCitationPromotionTarget(context({ targetUrlKey: "--target" }))).toBe(context().targetUrl);
  });

  it("rejects application fallback targets even for dry-runs", () => {
    expect(() => assertExplicitCitationPromotionTarget(context({ targetUrlKey: "POSTGRES_POOLED_URL" })))
      .toThrow(Error);
  });

  it("requires a matching expected deployment for every promotion plan", () => {
    expect(() => assertExplicitCitationPromotionTarget(context({ expectedDeployment: null })))
      .toThrow(Error);
    expect(() => assertExplicitCitationPromotionTarget(context({ expectedDeployment: "other" })))
      .toThrow(Error);
  });

  it("rejects other backends and invalid or misidentified targets", () => {
    expect(() => assertExplicitCitationPromotionTarget(context({ backend: "retired-backend" }))).toThrow(Error);
    expect(() => assertExplicitCitationPromotionTarget(context({ targetUrl: "https://example.invalid" }))).toThrow(Error);
    expect(() => assertExplicitCitationPromotionTarget(context({ deploymentFingerprint: "other/postgres" }))).toThrow(Error);
  });
});

describe("citation artifact source identity", () => {
  it("retains exact host/database identity, including IPv6 and decoded database names", () => {
    expect(assertCitationSourceIdentity("example/dosewiki")).toBe("example/dosewiki");
    expect(assertCitationSourceIdentity("::1/research notes")).toBe("::1/research notes");
  });

  it.each([
    "https://example.invalid",
    "postgres://reader:secret@example/dosewiki",
    "reader:secret@example/dosewiki",
    "example/",
    "example/dose/wiki",
    "EXAMPLE/dosewiki",
  ])("rejects noncanonical or credential-bearing source %s", (identity) => {
    expect(() => assertCitationSourceIdentity(identity)).toThrow(Error);
  });
});
