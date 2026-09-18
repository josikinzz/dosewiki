import { afterAll, describe, expect, it } from "vitest";

import { formatReviewerIdentity } from "./reviewerIdentity";

process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS = "LYREA,OLDHANDLE";
afterAll(() => {
  delete process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS;
});

describe("formatReviewerIdentity", () => {
  it("resolves legacy local reviewer handles to the contributor display name", () => {
    expect(formatReviewerIdentity("oldhandle@local.dose.wiki")).toBe("Lyrea");
  });

  it("formats unknown local credential handles without exposing the email domain", () => {
    expect(formatReviewerIdentity("some_editor@local.dose.wiki")).toBe("Some Editor");
  });

  it("leaves external reviewer addresses unchanged", () => {
    expect(formatReviewerIdentity("reviewer@example.com")).toBe("reviewer@example.com");
  });
});
