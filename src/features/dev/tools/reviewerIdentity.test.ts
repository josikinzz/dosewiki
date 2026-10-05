import { afterAll, describe, expect, it } from "vitest";

import { setEditorLegacyContributorHandleGroups } from "../../../../lib/contributorProfileIdentity";
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

  it("resolves through the value the editor page hands the browser, where the environment is empty", () => {
    const saved = process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS;
    delete process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS;
    try {
      expect(formatReviewerIdentity("browserhandle@local.dose.wiki")).toBe("Browserhandle");
      setEditorLegacyContributorHandleGroups("LYREA,BROWSERHANDLE");
      expect(formatReviewerIdentity("browserhandle@local.dose.wiki")).toBe("Lyrea");
    } finally {
      setEditorLegacyContributorHandleGroups("");
      process.env.LEGACY_CONTRIBUTOR_HANDLE_GROUPS = saved;
    }
  });
});
