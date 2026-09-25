import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

import { GET } from "./route";

const VIEWER_ENV = ["NODE_ENV", "DEV_SCREENSHOT_VIEWER", "DATA_WRITES_FROZEN"] as const;

function request(host = "127.0.0.1:3100") {
  return new Request(`http://${host}/api/dev/screenshot-viewer/session`, { headers: { host } });
}

describe("GET /api/dev/screenshot-viewer/session", () => {
  let previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    previous = Object.fromEntries(VIEWER_ENV.map((key) => [key, process.env[key]]));
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SCREENSHOT_VIEWER", "1");
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
  });

  afterEach(() => {
    for (const key of VIEWER_ENV) vi.stubEnv(key, previous[key]);
  });

  it("serves the presentation session to a loopback caller when the gate is open, without a cookie", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ user: { email: "screenshot-viewer@localhost.invalid" } });
  });

  it.each([
    ["NODE_ENV is production", { NODE_ENV: "production" }],
    ["the opt-in is unset", { DEV_SCREENSHOT_VIEWER: undefined }],
    ["the write freeze is off", { DATA_WRITES_FROZEN: undefined }],
  ])("answers 404 when %s", async (_label, overrides) => {
    for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
    expect((await GET(request())).status).toBe(404);
  });

  it("answers 404 to a non-loopback host", async () => {
    expect((await GET(request("dev.dose.wiki"))).status).toBe(404);
  });
});
