import { describe, expect, it } from "vitest";
import {
  findProfileByAuthorName,
  normalizeAssignedProfileKey,
  profileMatchesAuthorName,
  stripSubmitterSubjectFields,
  SUBMITTER_RESTRICTED_SUBJECT_FIELDS,
  withEditorAssignedProfileKey,
} from "../server/lib/tripReportAttribution";
import { profileMatchesName, toContributorDisplayName } from "./contributorProfileIdentity";

describe("trip report contributor attribution", () => {
  it("drops every submitter-claimed identity and link field while keeping the rest of the subject", () => {
    const stripped = stripSubmitterSubjectFields({
      name: "Impersonator",
      profile_key: "FOUNDER",
      avatar_url: "https://attacker.example/face.png",
      pdf_url: "https://attacker.example/tracker.pdf",
      setting: "Home",
    });

    expect(stripped).toEqual({ name: "Impersonator", setting: "Home" });
    for (const field of SUBMITTER_RESTRICTED_SUBJECT_FIELDS) {
      expect(field in stripped).toBe(false);
    }
  });

  it("replaces any stored attribution with the editor-assigned key at promotion", () => {
    const subject = {
      name: "Impersonator",
      profile_key: "FOUNDER",
      avatar_url: "https://attacker.example/face.png",
      pdf_url: "https://attacker.example/tracker.pdf",
    };

    expect(withEditorAssignedProfileKey(subject, "")).toEqual({ name: "Impersonator" });
    expect(withEditorAssignedProfileKey(subject, "ADA")).toEqual({ name: "Impersonator", profile_key: "ADA" });
  });

  it("normalizes an editor-assigned key to stored contributor casing", () => {
    expect(normalizeAssignedProfileKey("  ada  ")).toBe("ADA");
    expect(normalizeAssignedProfileKey(undefined)).toBe("");
  });
});

describe("author name claim matching", () => {
  const storedProfiles = [
    { key: "NERVEWING", displayName: "nervewing", aliases: ["nerve wing"] },
    { key: "ADA", displayName: "Ada Lovelace", aliases: [] },
    // A row with no stored display name still renders under one derived from
    // its key, so it must answer to that name too.
    { key: "NO-NAME", displayName: "", aliases: [] },
  ];

  it("matches a byline against display names and explicit aliases only", () => {
    expect(findProfileByAuthorName(storedProfiles, "nervewing")?.key).toBe("NERVEWING");
    expect(findProfileByAuthorName(storedProfiles, "  NerveWing  ")?.key).toBe("NERVEWING");
    expect(findProfileByAuthorName(storedProfiles, "nerve wing")?.key).toBe("NERVEWING");
    expect(findProfileByAuthorName(storedProfiles, "No Name")?.key).toBe("NO-NAME");
    // Exact match only: a first name is not a claim on "Ada Lovelace".
    expect(findProfileByAuthorName(storedProfiles, "Ada")).toBeNull();
    expect(findProfileByAuthorName(storedProfiles, "Anonymous")).toBeNull();
    expect(findProfileByAuthorName(storedProfiles, "   ")).toBeNull();
  });

  it("agrees with the public read path matcher it guards", () => {
    // The Postgres copy decides whether an editor is asked to adjudicate a name
    // claim; the lib copy decides whether the published page would honour it.
    // Disagreement in either direction reopens the impersonation path.
    const candidates = [
      "nervewing",
      "NerveWing",
      "nerve wing",
      "Ada Lovelace",
      "Ada",
      "No Name",
      "Anonymous",
      "",
    ];

    for (const stored of storedProfiles) {
      const publicProfile = {
        displayName: stored.displayName || toContributorDisplayName(stored.key),
        aliases: stored.aliases,
      };

      for (const candidate of candidates) {
        expect([stored.key, candidate, profileMatchesAuthorName(stored, candidate)]).toEqual([
          stored.key,
          candidate,
          profileMatchesName(publicProfile, candidate),
        ]);
      }
    }
  });
});
