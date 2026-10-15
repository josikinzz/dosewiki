import { describe, expect, it } from "vitest";
import { isServiceCronRequest } from "./serviceCronPaths";

describe("isServiceCronRequest", () => {
  it("admits nothing else", () => {
    expect(isServiceCronRequest("POST", "/api/cron/publication-delivery")).toBe(false);
    expect(isServiceCronRequest("GET", "/api/cron")).toBe(false);
    expect(isServiceCronRequest("GET", "/api/cron/unknown")).toBe(false);
    expect(isServiceCronRequest("GET", "/api/cron/publication-delivery/extra")).toBe(false);
    expect(isServiceCronRequest("GET", "/api/warm")).toBe(false);
  });
});
