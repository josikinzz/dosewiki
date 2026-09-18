import { afterEach, describe, expect, it, vi } from "vitest";
import { approveProposal, fetchProposals } from "./queueRequests";

afterEach(() => vi.unstubAllGlobals());

describe("proposal response integrity", () => {
  it("does not announce publication when approval returns no outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await expect(approveProposal("proposal-1")).rejects.toThrow();
  });

  it("does not hide pending work behind an empty list when the list response is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await expect(fetchProposals()).rejects.toThrow();
  });

  it("rejects a non-JSON success response instead of reporting publication", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unavailable</html>")));
    await expect(approveProposal("proposal-1")).rejects.toThrow();
  });
});
