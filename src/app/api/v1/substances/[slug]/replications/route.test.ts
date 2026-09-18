import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSubstanceShowcaseWorks: vi.fn(),
  getPublicReplicationsForSubstance: vi.fn(),
  enforceRateLimit: vi.fn(),
}));
vi.mock("@/app/_components/public-routes/showcaseCollections", () => ({
  getSubstanceShowcaseWorks: mocks.getSubstanceShowcaseWorks,
}));
vi.mock("@server/data/publicData", () => ({
  getPublicReplicationsForSubstance: mocks.getPublicReplicationsForSubstance,
}));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { encodeSubstanceReplicationCursor } from "@server/public-api/substanceReplications";
import { GET, OPTIONS } from "./route";

const replication = {
  _id: "private-id", storage_id: "private-storage", permission_notes: "private-notes",
  removal_contact: "private@example.com", title: "A work", artist: "Artist",
  type: "video" as const, effect_slug: "drifting", format: "mp4", created_at: "2026-01-01",
  url: "https://media.example/work.mp4", rights_status: "permission-granted" as const,
  credit_line: "Artist, used with permission", source_url: "https://example.com/source",
  preview_url: "https://media.example/preview.mp4", has_audio: false,
};
const canonicalSlugs = ["work-c", "work-a", "work-d", "work-b", "work-e"];
const gallery = [...canonicalSlugs].reverse().map((slug) => ({
  replication: { ...replication, slug },
  provenance: { matchedVia: "specific_drug", substanceSlug: "ketamine", effectSlug: "drifting" },
}));

function request(query = "", slug = "ketamine") {
  return GET(new Request(`https://dose.wiki/api/v1/substances/${slug}/replications${query}`), {
    params: Promise.resolve({ slug }),
  });
}

describe("public substance replication collection", () => {
  beforeEach(() => {
    mocks.getSubstanceShowcaseWorks.mockReset().mockResolvedValue({
      works: canonicalSlugs.map((slug) => ({ slug })),
      collectionLabel: "Ketamine replications",
    });
    mocks.getPublicReplicationsForSubstance.mockReset().mockResolvedValue({ items: gallery });
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
  });

  it("traverses the complete canonical showcase order once even when page size changes", async () => {
    const first = await request("?limit=2");
    const firstBody = await first.json();
    const secondBody = await (await request(`?limit=1&cursor=${firstBody.pagination.next_cursor}`)).json();
    const lastBody = await (await request(`?limit=100&cursor=${secondBody.pagination.next_cursor}`)).json();
    const slugs = [firstBody, secondBody, lastBody].flatMap((body) => body.data.map((item: { slug: string }) => item.slug));
    expect(slugs).toEqual(canonicalSlugs);
    expect(lastBody.pagination).toMatchObject({ has_more: false, next_cursor: null });
    expect(firstBody.meta).toMatchObject({ total: 5, substance_slug: "ketamine", collection_label: "Ketamine replications" });
    expect(lastBody.meta.collection_revision).toBe(firstBody.meta.collection_revision);
    expect(first.headers.get("access-control-allow-origin")).toBe("*");
    expect(first.headers.get("cache-control")).toContain("public");
  });

  it("preserves public media rights and placement evidence without publishing private records", async () => {
    const body = await (await request()).json();
    expect(body.data[0]).toMatchObject({
      slug: "work-c", preview_url: replication.preview_url, has_audio: false,
      rights: { status: "permission-granted", credit_line: replication.credit_line, source_url: replication.source_url },
      association: { basis: "specific_drug", substance_slug: "ketamine", effect_slug: "drifting" },
    });
    expect(JSON.stringify(body)).not.toContain("private-");
    expect(JSON.stringify(body)).not.toContain("private@example.com");
  });

  it("leaves unavailable association evidence explicitly unknown", async () => {
    mocks.getPublicReplicationsForSubstance.mockResolvedValue({
      items: gallery.map((item) => ({ ...item, provenance: undefined })),
    });
    const body = await (await request()).json();
    expect(body.data[0].association).toEqual({ basis: "unknown", substance_slug: "ketamine" });
  });

  it("distinguishes a known empty collection from an unknown substance", async () => {
    mocks.getSubstanceShowcaseWorks.mockResolvedValueOnce({ works: [], collectionLabel: "Ketamine replications" });
    mocks.getPublicReplicationsForSubstance.mockResolvedValueOnce({ items: [] });
    const empty = await request();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({
      data: [], meta: { total: 0 }, pagination: { has_more: false, next_cursor: null },
    });
    mocks.getSubstanceShowcaseWorks.mockResolvedValueOnce(null);
    const unknown = await request();
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: { code: "not_found" } });
    expect(unknown.headers.has("cache-control")).toBe(false);
  });

  it("rejects malformed, foreign, and out-of-range cursors instead of silently restarting", async () => {
    const first = await (await request("?limit=1")).json();
    const outside = encodeSubstanceReplicationCursor({
      substance_slug: "ketamine", revision: first.meta.collection_revision, offset: 100,
    });
    const responses = [
      await request("?cursor=not-base64-json"),
      await request(`?cursor=${first.pagination.next_cursor}`, "lsd"),
      await request(`?cursor=${outside}`),
    ];
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_cursor" } });
      expect(response.headers.has("cache-control")).toBe(false);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("rejects stale cursors after reordering rather than omitting or duplicating works", async () => {
    const first = await (await request("?limit=2")).json();
    mocks.getSubstanceShowcaseWorks.mockResolvedValue({
      works: [...canonicalSlugs].reverse().map((slug) => ({ slug })), collectionLabel: "Ketamine replications",
    });
    const stale = await request(`?cursor=${first.pagination.next_cursor}`);
    expect(stale.status).toBe(400);
    expect(await stale.json()).toMatchObject({ error: { code: "invalid_cursor" } });
    const restarted = await (await request()).json();
    expect(restarted.data.map((item: { slug: string }) => item.slug)).toEqual([...canonicalSlugs].reverse());
    expect(restarted.meta.collection_revision).not.toBe(first.meta.collection_revision);
  });

  it("keeps cursors valid when media storage URLs rotate", async () => {
    const first = await (await request("?limit=2")).json();
    mocks.getPublicReplicationsForSubstance.mockResolvedValue({
      items: gallery.map((item) => ({ ...item, replication: { ...item.replication, url: "https://media.example/refreshed.mp4" } })),
    });
    const next = await request(`?cursor=${first.pagination.next_cursor}`);
    expect(next.status).toBe(200);
    const body = await next.json();
    expect(body.meta.collection_revision).toBe(first.meta.collection_revision);
    expect(body.data.map((item: { slug: string }) => item.slug)).toEqual(canonicalSlugs.slice(2));
  });

  it("fails without caching when a canonical work cannot be resolved", async () => {
    mocks.getPublicReplicationsForSubstance.mockResolvedValue({ items: gallery.slice(1) });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "service_unavailable" } });
      expect(response.headers.has("cache-control")).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it("retains CORS on rate limits and serves preflight without a content read", async () => {
    mocks.enforceRateLimit.mockResolvedValue(new Response("Rate limited", { status: 429, headers: { "Retry-After": "60" } }));
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("access-control-allow-origin")).toBe("*");
    expect(limited.headers.get("retry-after")).toBe("60");
    const preflight = OPTIONS();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
    expect(mocks.getSubstanceShowcaseWorks).not.toHaveBeenCalled();
  });
});
