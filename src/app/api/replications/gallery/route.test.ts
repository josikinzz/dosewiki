import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

const mocks = vi.hoisted(() => ({ index: vi.fn(), hydrate: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@server/next/galleryBrowseIndex", () => ({ getGalleryBrowseIndex: mocks.index, hydrateGalleryPage: mocks.hydrate }));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.rateLimit }));
const preview: PublicGalleryReplicationPreview = {
  _id: "replication-id", slug: "drifting", title: "Drifting", artist: "Artist", type: "image", format: "webp",
  url: "https://media.example/drifting.webp", created_at: "2026-01-01",
};
let revision = 0;
function setIndex(rows: PublicGalleryReplicationPreview[], canonicalRows = rows) {
  const directory = [{ key: "ARTIST", displayName: "Artist", aliases: ["artist"] }];
  const canonical = { rows: canonicalRows, effects: [], directory };
  const identity = String(++revision);
  mocks.index.mockResolvedValue({ rows, effects: [], directory, canonical, revision: identity, cacheIdentity: identity });
}
beforeEach(() => {
  mocks.rateLimit.mockReset().mockResolvedValue(null);
  mocks.index.mockReset();
  mocks.hydrate.mockReset().mockImplementation(async (rows) => {
    if (rows.length > 65) throw new Error("A gallery page accepts at most 65 works.");
    return rows;
  });
  setIndex([preview]);
});

describe("bounded replication gallery pages", () => {
  it("reaches every search identity once using the returned opaque cursor", async () => {
    const rows = Array.from({ length: 140 }, (_, index) => ({ ...preview, _id: `id-${index}`, slug: `work-${index}`, title: `Work ${String(index).padStart(3, "0")}` }));
    setIndex(rows);
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await GET(new Request(`https://dose.wiki/api/replications/gallery?q=work${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
      const payload = await response.json();
      expect(payload.total).toBe(140);
      expect(payload.data.length).toBeLessThanOrEqual(64);
      ids.push(...payload.data.map((row: PublicGalleryReplicationPreview) => row._id));
      cursor = payload.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(140);
    expect(new Set(ids)).toEqual(new Set(rows.map((row) => row._id)));
  });

  it("pages complete artist previews in canonical rail order rather than consuming a prolific artist first", async () => {
    const rows = Array.from({ length: 34 }, (_, artist) =>
      Array.from({ length: 24 }, (_, work) => ({
        ...preview, _id: `${artist}-${work}`, slug: `work-${artist}-${work}`,
        artist: `Artist ${String(artist).padStart(2, "0")}`, title: `Work ${work}`,
      })),
    ).flat();
    setIndex(rows);
    const first = await (await GET(new Request("https://dose.wiki/api/replications/gallery"))).json();
    const allArtists: string[] = [];
    const ids = new Set<string>();
    let page = first;
    while (true) {
      expect(page.total).toBe(rows.length);
      expect(page.data.length).toBeLessThanOrEqual(16 * 14);
      const selected = page.groups.filter((group: { itemIds: string[] }) => group.itemIds.length);
      expect(selected.length).toBeLessThanOrEqual(16);
      for (const group of selected) {
        expect(group.count).toBe(24);
        expect(group.itemIds).toHaveLength(14);
        allArtists.push(group.key);
        for (const id of group.itemIds) {
          expect(ids.has(id)).toBe(false);
          expect(page.data.some((row: PublicGalleryReplicationPreview) => row._id === id)).toBe(true);
          ids.add(id);
        }
      }
      if (!page.nextCursor) break;
      page = await (await GET(new Request(`https://dose.wiki/api/replications/gallery?cursor=${page.nextCursor}`))).json();
    }
    expect(allArtists).toEqual(first.groups.map((group: { key: string }) => group.key));
    expect(ids.size).toBe(34 * 14);
    const focused = await (await GET(new Request("https://dose.wiki/api/replications/gallery?focusKind=artist&focusKey=artist-00"))).json();
    expect(focused.data).toHaveLength(24);
  });

  it("rejects a rail cursor reused for a different filter, locale, or old cursor contract", async () => {
    setIndex(Array.from({ length: 17 }, (_, index) => ({ ...preview, _id: String(index), slug: `work-${index}`, artist: `Artist ${index}` })));
    const first = await (await GET(new Request("https://dose.wiki/api/replications/gallery"))).json();
    expect(first.nextCursor).not.toBeNull();
    for (const filter of ["type=video", "locale=zh-Hans", "sort=oldest"]) {
      expect((await GET(new Request(`https://dose.wiki/api/replications/gallery?${filter}&cursor=${first.nextCursor}`))).status).toBe(409);
    }
    const old = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString());
    delete old.version;
    const cursor = Buffer.from(JSON.stringify(old)).toString("base64url");
    expect((await GET(new Request(`https://dose.wiki/api/replications/gallery?cursor=${cursor}`))).status).toBe(409);
  });

  it("includes a matching linked work beyond the opening page without shifting continuation", async () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({ ...preview, _id: `id-${index}`, slug: `work-${index}`, title: `Needle ${String(index).padStart(2, "0")}` }));
    setIndex(rows);
    const response = await GET(new Request("https://dose.wiki/api/replications/gallery?q=needle&viewer=work-69"));
    const payload = await response.json();
    expect(payload.total).toBe(70);
    expect(payload.data).toHaveLength(65);
    expect(payload.data.some((row: PublicGalleryReplicationPreview) => row.slug === "work-69")).toBe(true);
    const next = await GET(new Request(`https://dose.wiki/api/replications/gallery?q=needle&cursor=${payload.nextCursor}`));
    expect((await next.json()).data).toHaveLength(6);
  });

  it("matches both translated and canonical titles across the complete index", async () => {
    setIndex([{ ...preview, title: "漂移" }], [preview]);
    for (const query of ["漂移", "drifting"]) {
      const response = await GET(new Request(`https://dose.wiki/api/replications/gallery?locale=zh-Hans&q=${encodeURIComponent(query)}`));
      expect((await response.json()).data.map((row: PublicGalleryReplicationPreview) => row.slug)).toEqual(["drifting"]);
    }
  });

  it("refuses continuation after a source revision changes", async () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({ ...preview, _id: String(index), slug: `work-${index}` }));
    setIndex(rows);
    const first = await GET(new Request("https://dose.wiki/api/replications/gallery?focusKind=artist&focusKey=artist"));
    const { nextCursor } = await first.json();
    setIndex(rows.slice(1));
    const changed = await GET(new Request(`https://dose.wiki/api/replications/gallery?focusKind=artist&focusKey=artist&cursor=${nextCursor}`));
    expect(changed.status).toBe(409);
  });

  it("fails closed on read errors and preserves rate limiting", async () => {
    mocks.index.mockRejectedValueOnce(new Error("unavailable"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const failed = await GET(new Request("https://dose.wiki/api/replications/gallery"));
    expect(failed.status).toBe(503);
    expect(failed.headers.get("Cache-Control")).toBe("private, no-store");
    mocks.rateLimit.mockResolvedValueOnce(new Response("Too many requests", { status: 429 }));
    const limited = await GET(new Request("https://dose.wiki/api/replications/gallery"));
    expect(limited.status).toBe(429);
  });
});
