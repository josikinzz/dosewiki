import { describe, expect, it } from "vitest";

import { filterPeople, findPersonBySlug, pairPeople, personLabel } from "./peopleModel";

const DATA = {
  self: "josie@example.com",
  members: [
    { email: "ada@example.com", username: "ada", role: "editor" as const },
    { email: "bob@example.com", username: "bob", role: "contributor" as const },
  ],
  links: [
    { key: "ADA", membershipEmail: "Ada@Example.com" },
    { key: "ADA2", membershipEmail: "ada@example.com" },
    { key: "GHOST", membershipEmail: "gone@example.com" },
  ],
};

const PROFILES = [
  { key: "ADA", displayName: "Ada Lovelace" },
  { key: "ADA2", displayName: "Ada (old)" },
  { key: "GHOST", displayName: "Ghost" },
  { key: "ZED", displayName: "Zed Artist" },
];

describe("pairPeople", () => {
  it("pairs each account with its linked profile and flags whatever stands alone", () => {
    const people = pairPeople(DATA, PROFILES);
    expect(people.map((person) => [person.id, person.profileKey, person.flag])).toEqual([
      ["account:ada@example.com", "ADA", null],
      ["profile:ADA2", "ADA2", "shared-link"],
      ["account:bob@example.com", null, "no-profile"],
      ["profile:GHOST", "GHOST", "no-account"],
      ["profile:ZED", "ZED", "unlinked-profile"],
    ]);
    expect(personLabel(people[0])).toBe("ada");
    expect(personLabel(people[4])).toBe("Zed Artist");
  });

  it("finds a person by email or by profile key, and filters by view and search", () => {
    const people = pairPeople(DATA, PROFILES);
    expect(findPersonBySlug(people, "BOB@example.com")?.id).toBe("account:bob@example.com");
    expect(findPersonBySlug(people, "zed")?.id).toBe("profile:ZED");
    expect(filterPeople(people, "accounts", "").map((person) => person.id)).toEqual([
      "account:ada@example.com",
      "account:bob@example.com",
    ]);
    expect(filterPeople(people, "unlinked", "").map((person) => person.id)).toEqual([
      "profile:ADA2",
      "account:bob@example.com",
      "profile:GHOST",
      "profile:ZED",
    ]);
    expect(filterPeople(people, "all", "lovelace").map((person) => person.id)).toEqual(["account:ada@example.com"]);
  });
});
