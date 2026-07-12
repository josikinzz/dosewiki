import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReportRequest(body: string): Request {
  return new Request("https://dosewiki-admin.vercel.app/api/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body,
  });
}

describe("CSP observation collector", () => {
  it("accepts a browser report while logging only redacted origins", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = makeReportRequest(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://dosewiki-admin.vercel.app/dev?review=dont-log-this",
          "blocked-uri": "https://unexpected.example/script.js?token=dont-log-this",
          "effective-directive": "script-src-elem",
          disposition: "report",
        },
      }),
    );

    const response = await POST(request);
    const logged = JSON.stringify(info.mock.calls);

    expect(response.status).toBe(204);
    expect(logged).toContain("https://dosewiki-admin.vercel.app");
    expect(logged).toContain("https://unexpected.example");
    expect(logged).not.toContain("dont-log-this");
  });

  it("rejects malformed report bodies", async () => {
    const response = await POST(makeReportRequest("not json"));

    expect(response.status).toBe(400);
  });

  it("rejects browser-incompatible content types", async () => {
    const response = await POST(
      new Request("https://dosewiki-admin.vercel.app/api/csp-report", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ "csp-report": {} }),
      }),
    );

    expect(response.status).toBe(415);
  });

  it("rejects oversized report bodies before logging", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(makeReportRequest("x".repeat(16_385)));

    expect(response.status).toBe(413);
    expect(info).not.toHaveBeenCalled();
  });
});
