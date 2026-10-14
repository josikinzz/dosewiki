import { describe, expect, it } from "vitest";
import { projectPublicApiReplication } from "./v1";

describe("public API v1 contract helpers", () => {
  it("removes private storage and permission fields from replications", () => {
    const projected = projectPublicApiReplication({
      _id: "private-id",
      _creationTime: 1,
      storage_id: "private-storage",
      thumbnail_storage_id: "private-thumbnail",
      permission_notes: "private note",
      removal_contact: "private@example.com",
      slug: "drifting",
      title: "Drifting",
      artist: "Artist",
      type: "video",
      effect_slug: "visual-drifting",
      format: "mp4",
      created_at: "2026-01-01",
      date_info: {
        value: "2020",
        kind: "year",
        confidence: "high",
        researched_at: "2026-01-02",
      },
      url: "https://media.example/drifting.mp4",
      rights_status: "permission-granted",
    });

    expect(projected).not.toHaveProperty("_id");
    expect(projected).not.toHaveProperty("storage_id");
    expect(JSON.stringify(projected)).not.toContain("private note");
  });
});
