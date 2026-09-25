import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import type { AppRole } from "@/lib/auth/roles";

import { GET } from "./route";

vi.mock("server-only", () => ({}));

const sessionMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));
vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: sessionMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const dataMocks = vi.hoisted(() => ({ getPublicReplications: vi.fn() }));
vi.mock("@server/data/publicData", () => ({
  getPublicReplications: dataMocks.getPublicReplications,
}));

function signIn(role: AppRole | null) {
  sessionMocks.requireRoleSession.mockImplementation(roleSessionFor(role, { email: "ada@example.com", name: "Ada" }));
}

const row = (slug: string, overrides: Record<string, unknown> = {}) => ({
  _id: slug,
  slug,
  title: slug.replace(/-/g, " "),
  artist: "Ada",
  type: "image",
  url: `https://media.test/${slug}.jpg`,
  thumbnail_url: `https://media.test/${slug}.thumb.jpg`,
  created_at: "2026-01-01T00:00:00.000Z",
  storage_id: "private-storage-id",
  permission_notes: "private",
  ...overrides,
});

const BASE = "https://dose.wiki/api/dev/replications/playlist-candidates";
const get = (query: string) => GET(new Request(`${BASE}?${query}`));

describe("GET /api/dev/replications/playlist-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataMocks.getPublicReplications.mockResolvedValue([
      row("glowing-fractal-tunnel", { created_at: "2026-03-01T00:00:00.000Z" }),
      row("breathing-walls", { artist: "Grace", created_at: "2026-02-01T00:00:00.000Z" }),
      row("excluded-junk", { showcase_excluded: true }),
      row("sound-piece", { type: "audio" }),
    ]);
  });

  it("refuses a visitor who is not signed in as a member", async () => {
    signIn(null);
    const response = await get("q=tunnel");
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(dataMocks.getPublicReplications).not.toHaveBeenCalled();
  });

  it("answers a contributor's search with public card fields only, newest first", async () => {
    signIn("contributor");
    const response = await get("q=");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.candidates.map((candidate: { slug: string }) => candidate.slug)).toEqual([
      "glowing-fractal-tunnel",
      "breathing-walls",
    ]);
    expect(payload.candidates[0]).toEqual({
      slug: "glowing-fractal-tunnel",
      title: "glowing fractal tunnel",
      artist: "Ada",
      type: "image",
      thumbnail_url: "https://media.test/glowing-fractal-tunnel.thumb.jpg",
      url: "https://media.test/glowing-fractal-tunnel.jpg",
      duration: null,
    });
  });

  it("matches every word against title, artist and slug", async () => {
    signIn("contributor");
    const payload = await (await get("q=grace%20walls")).json();
    expect(payload.candidates.map((candidate: { slug: string }) => candidate.slug)).toEqual(["breathing-walls"]);
  });

  it("caps a search at 24 results", async () => {
    signIn("contributor");
    dataMocks.getPublicReplications.mockResolvedValue(
      Array.from({ length: 40 }, (_, index) => row(`work-${index}`)),
    );
    const payload = await (await get("q=work")).json();
    expect(payload.candidates).toHaveLength(24);
  });

  it("resolves slugs in the order asked and leaves out anything a playlist cannot hold", async () => {
    signIn("contributor");
    const payload = await (await get("slugs=breathing-walls,missing-work,excluded-junk,glowing-fractal-tunnel")).json();
    expect(payload.candidates.map((candidate: { slug: string }) => candidate.slug)).toEqual([
      "breathing-walls",
      "glowing-fractal-tunnel",
    ]);
  });

  it("rejects a malformed slug list and an overlong search", async () => {
    signIn("contributor");
    expect((await get("slugs=Not%20A%20Slug")).status).toBe(400);
    expect((await get(`q=${"a".repeat(81)}`)).status).toBe(400);
    expect((await get(`slugs=${Array.from({ length: 251 }, (_, index) => `w-${index}`).join(",")}`)).status).toBe(400);
  });
});
