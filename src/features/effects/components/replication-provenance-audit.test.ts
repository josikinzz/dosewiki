import { describe, expect, it } from "vitest";
import { buildProvenanceAudit, classifyTitleKind, normalizeMediaIdentity } from "../../../../scripts/replications/lib/provenance-audit.mjs";

const live = (overrides = {}) => ({ _id: "live-1", slug: "10376-12927-25985-unknown", title: "10376-12927-25985", artist: "Unknown", type: "image", effect_slug: "colour-enhancement", storage_id: "storage-1", url: "https://cdn.test/10376-12927-25985.jpg", format: "jpg", created_at: "2026-01-01T00:00:00.000Z", ...overrides });
const archived = (overrides = {}) => ({ _id: { $oid: "ei-1" }, title: "LSD field", artist: "/u/areponaf", artist_url: "https://reddit.com/u/areponaf", type: "image", resource: "https://archive.test/10376-12927-25985.jpg", associated_effects: [], ...overrides });

describe("replication provenance audit", () => {
  it("normalizes filenames into stable media identities", () => {
    expect(normalizeMediaIdentity("https://host.test/A%20Picture_by_Name.JPG?x=1")).toBe("a picture by name");
  });
  it("classifies placeholder and filename titles", () => {
    expect(classifyTitleKind("0EvBcsq")).toBe("placeholder");
    expect(classifyTitleKind("Cubism_Field_by_Chelsea_Morgan")).toBe("filename");
    expect(classifyTitleKind("LSD field")).toBe("descriptive");
  });
  it("proposes an archive-supported correction for an exact media match", () => {
    const audit = buildProvenanceAudit({ liveReplications: [live()], effectIndexReplications: [archived()], effectsById: new Map(), healthById: new Map([["live-1", { media: "ok", thumbnail: "not-applicable", media_status: 200 }]]) });
    expect(audit.records).toEqual([expect.objectContaining({ audit_id: "replication:10376-12927-25985", status: "proposed", match: expect.objectContaining({ method: "resource-basename", confidence: "archive-only" }), proposal: expect.objectContaining({ title: "LSD field", title_kind: "historical", artist: "/u/areponaf", artist_url: "https://reddit.com/u/areponaf", credit_line: "LSD field by /u/areponaf" }), action: "correct" })]);
    expect(audit.summary).toMatchObject({ total: 1, suspect: 1, proposed: 1 });
  });
  it("holds conflicting archive matches and flags missing video thumbnails", () => {
    const audit = buildProvenanceAudit({ liveReplications: [live({ type: "video", title: "Untitled", format: "mp4", thumbnail_url: null })], effectIndexReplications: [archived({ title: "First", artist: "One" }), archived({ _id: { $oid: "ei-2" }, title: "Second", artist: "Two" })], effectsById: new Map(), healthById: new Map([["live-1", { media: "ok", thumbnail: "missing", media_status: 200 }]]) });
    expect(audit.records[0]).toMatchObject({ status: "traced", action: "hold", health: { thumbnail: "missing" } });
    expect(audit.records[0].symptoms).toContain("missing-thumbnail");
    expect(audit.records[0].evidence).toHaveLength(2);
  });
});
