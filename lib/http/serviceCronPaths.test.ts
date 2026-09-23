import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isServiceCronRequest } from "./serviceCronPaths";

const cronRoot = resolve(__dirname, "../../src/app/api/cron");
const cronRoutes = readdirSync(cronRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(cronRoot, entry.name, "route.ts")))
  .map((entry) => `/api/cron/${entry.name}`);

describe("isServiceCronRequest", () => {
  it("admits a GET to every scheduled route under /api/cron", () => {
    expect(cronRoutes.length).toBeGreaterThan(0);
    for (const path of cronRoutes) expect(isServiceCronRequest("GET", path), path).toBe(true);
  });

  it("admits nothing else", () => {
    expect(isServiceCronRequest("POST", cronRoutes[0])).toBe(false);
    expect(isServiceCronRequest("GET", "/api/cron")).toBe(false);
    expect(isServiceCronRequest("GET", "/api/cron/unknown")).toBe(false);
    expect(isServiceCronRequest("GET", `${cronRoutes[0]}/extra`)).toBe(false);
    expect(isServiceCronRequest("GET", "/api/warm")).toBe(false);
  });
});
