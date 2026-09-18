import { describe, expect, it } from "vitest";
import { resolveContributorHref, type ContributorDirectory } from "../../../lib/contributorDirectory";
import userProfiles from "@data/contributors/userProfiles.json";

// Effect Index credits contributors by free-text name. These cases pin the
// mapping decisions taken for the names that had no profile, so a later edit
// cannot silently re-break the credits they appear on.
//
// Runtime resolution reads contributor profiles from Postgres, not from this
// seed, so the negative cases are only meaningful when checked against the
// whole live set: the seed plus the identities that only exist because the
// Effect Index import created them (scripts/migrate/import-effectindex-identities.mjs).
const effectIndexIdentities: ContributorDirectory = [
  { key: "JOSIE", displayName: "Josie Kins", aliases: ["josie", "josikinz", "josie kins"] },
  { key: "VISCID", displayName: "Viscid", aliases: ["viscid", "mark gillis"] },
  { key: "MAETHOR", displayName: "Maethor", aliases: ["maethor"] },
  { key: "UTHERAPTOR", displayName: "utheraptor", aliases: ["utheraptor"] },
  { key: "HYPNAGOGIST", displayName: "Hypnagogist", aliases: ["hypnagogist"] },
  { key: "STINGRAYZ", displayName: "StingrayZ", aliases: ["stingrayz"] },
  { key: "RHO", displayName: "Rho", aliases: ["rho"] },
  { key: "NATALIE", displayName: "Natalie", aliases: ["natalie"] },
  { key: "NERVEWING", displayName: "Nervewing", aliases: ["nervewing"] },
];

const seededProfiles: ContributorDirectory = (userProfiles as Array<{
  key: string;
  displayName?: string;
  aliases?: string[];
}>).map((profile) => ({
  key: profile.key,
  displayName: profile.displayName ?? profile.key,
  aliases: profile.aliases ?? [],
}));

const directory: ContributorDirectory = [
  ...seededProfiles,
  ...effectIndexIdentities.filter(
    (identity) => !seededProfiles.some((profile) => profile.key === identity.key),
  ),
];

describe("Effect Index contributor mapping", () => {
  it("resolves Kaylee to the existing Kaytwo profile", () => {
    expect(resolveContributorHref("Kaylee", directory)).toBe("/contributors/kaytwo");
  });

  it.each(["Gabriel", "Graham"])("resolves %s to its own profile", (name) => {
    expect(resolveContributorHref(name, directory)).toBe(`/contributors/${name.toLowerCase()}`);
  });

  it.each(["liv", "Nicole", "Brack", "Kat", "chemi"])(
    "leaves %s unresolved so the credit renders as plain text",
    (name) => {
      expect(resolveContributorHref(name, directory)).toBeNull();
    },
  );
});
