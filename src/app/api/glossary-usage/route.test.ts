import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@server/translation/glossaryUsage", () => ({ getGlossaryUsage: vi.fn() }));

import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getGlossaryUsage } from "@server/translation/glossaryUsage";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
});

describe("public glossary usage boundary", () => {
  it("rejects malformed input before starting source reads", async () => {
    for (const query of ["term=x", "term=Tracers&offset=-1", "term=Tracers&offset=1.5", "term=Tracers%00"]) {
      const response = await GET(new Request(`https://dose.wiki/api/glossary-usage?${query}`));
      expect(response.status).toBe(400);
    }
    expect(getGlossaryUsage).not.toHaveBeenCalled();
  });

  it("preserves rate refusal without reading the corpus", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce(NextResponse.json({ error: "Slow down" }, { status: 429, headers: { "Retry-After": "60" } }));
    const response = await GET(new Request("https://dose.wiki/api/glossary-usage?term=Tracers"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(getGlossaryUsage).not.toHaveBeenCalled();
  });

  it("does not expose upstream errors or falsely report an empty result", async () => {
    vi.mocked(getGlossaryUsage).mockRejectedValueOnce(new Error("private-database-detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET(new Request("https://dose.wiki/api/glossary-usage?term=Tracers"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Usage sources could not be loaded. Please try again." });
    } finally {
      log.mockRestore();
    }
  });
});
