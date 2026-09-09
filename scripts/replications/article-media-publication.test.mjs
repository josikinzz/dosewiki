import { describe, expect, it } from "vitest";
import { isPublishableReplication } from "@/types/replications";
import { expectsPublication, verifyInsertedRow } from "./article-media-publication.mjs";

describe("expectsPublication", () => {
  it("agrees with isPublishableReplication, the gate the site actually applies", () => {
    // Restating the gate in a script is only safe while the two agree, so the
    // real implementation is imported and compared rather than described.
    for (const row of [
      { role: "replication", type: "image" },
      { role: "replication", type: "video" },
      { role: "replication", type: "audio" },
      { role: "figure", type: "image" },
      { role: "figure", type: "video" },
      { role: "figure", type: "audio" },
    ]) {
      expect(expectsPublication(row)).toBe(isPublishableReplication(row));
    }
  });

  it("reads a replication of any drawable kind as published and a figure as withheld", () => {
    expect(expectsPublication({ role: "replication", type: "image" })).toBe(true);
    // Audio is a published media kind: the tile draws a waveform frame and the
    // viewer stages a player.
    expect(expectsPublication({ role: "replication", type: "audio" })).toBe(true);
    expect(expectsPublication({ role: "figure", type: "image" })).toBe(false);
  });
});
describe("verifyInsertedRow", () => {
  const planned = {
    slug: "size-distortions",
    title: "Size distortions",
    artist: "Unknown",
    role: "replication",
    type: "video",
    format: "mp4",
    storage_id: "kg2storage000000000000000000000a",
  };
  const clientReturning = (row) => ({ query: async () => row });
  const servedAs = (contentType, status = 200) =>
    async () => ({ ok: status < 400, status, headers: { get: () => contentType } });

  it("passes a row that reads back as planned and serves its own format", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, url: "https://prod.test/a" }),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(true);
  });

  it("fails a row whose media does not resolve — the page would not exist", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, url: null }),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("no media and no page");
  });

  it("fails a row served as a type that disagrees with its format", async () => {
    // The failure this exists for: the file is intact and the browser downloads
    // it instead of drawing it, which looks like a broken page and nothing else.
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, url: "https://prod.test/a" }),
      row: planned,
      fetchImpl: servedAs("image/jpeg"),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("serves image/jpg");
  });

  it("fails a row whose role did not survive the write", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning({ ...planned, role: "figure", url: "https://prod.test/a" }),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("publication gate");
  });

  it("fails a slug that reads back as nothing", async () => {
    const verdict = await verifyInsertedRow({
      client: clientReturning(null),
      row: planned,
      fetchImpl: servedAs("video/mp4"),
    });
    expect(verdict.ok).toBe(false);
  });
});
