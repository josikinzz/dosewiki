import { describe, expect, it } from "vitest";

import { formatReviewerIdentity } from "./reviewerIdentity";

describe("formatReviewerIdentity", () => {
  it("resolves legacy local reviewer handles to the contributor display name", () => {
    expect(formatReviewerIdentity("witchy@local.dose.wiki")).toBe("Lyrea");
  });

  it("formats unknown local credential handles without exposing the email domain", () => {
    expect(formatReviewerIdentity("some_editor@local.dose.wiki")).toBe("Some Editor");
  });

  it("leaves external reviewer addresses unchanged", () => {
    expect(formatReviewerIdentity("reviewer@example.com")).toBe("reviewer@example.com");
  });
});
