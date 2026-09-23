import { describe, expect, it } from "vitest";
import { foreignOriginResponse } from "./requestOrigin";

const URL = "https://dose.wiki/api/test";

function request(method: string, headers: Record<string, string>) {
  return new Request(URL, { method, headers });
}

describe("foreignOriginResponse", () => {
  it.each(["editorWrite", "publicWrite"] as const)("%s admits only a same-site mutation", (posture) => {
    expect(foreignOriginResponse(request("POST", { origin: "https://dose.wiki", "sec-fetch-site": "same-origin" }), posture)).toBeNull();
    expect(foreignOriginResponse(request("POST", { origin: "https://dose.wiki" }), posture)).toBeNull();
    expect(foreignOriginResponse(request("POST", {}), posture)?.status).toBe(403);
    expect(foreignOriginResponse(request("POST", { origin: "https://evil.example" }), posture)?.status).toBe(403);
    expect(foreignOriginResponse(request("POST", { origin: "https://dose.wiki", "sec-fetch-site": "cross-site" }), posture)?.status).toBe(403);
    expect(foreignOriginResponse(request("POST", { origin: "https://dose.wiki", "sec-fetch-site": "none" }), posture)?.status).toBe(403);
  });

  it("editorRead admits reads without an Origin and direct navigation", () => {
    expect(foreignOriginResponse(request("GET", {}), "editorRead")).toBeNull();
    expect(foreignOriginResponse(request("GET", { "sec-fetch-site": "none" }), "editorRead")).toBeNull();
    expect(foreignOriginResponse(request("GET", { origin: "https://dose.wiki", "sec-fetch-site": "same-origin" }), "editorRead")).toBeNull();
    expect(foreignOriginResponse(request("GET", { origin: "https://evil.example" }), "editorRead")?.status).toBe(403);
    expect(foreignOriginResponse(request("GET", { "sec-fetch-site": "cross-site" }), "editorRead")?.status).toBe(403);
  });

  it("editor refusals carry the ORIGIN_REQUIRED code and are never cached", async () => {
    for (const posture of ["editorWrite", "editorRead"] as const) {
      const response = foreignOriginResponse(request("POST", { origin: "https://evil.example" }), posture);
      expect(await response?.json()).toMatchObject({ code: "ORIGIN_REQUIRED" });
      expect(response?.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});
