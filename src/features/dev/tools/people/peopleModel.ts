/**
 * Pure pairing and the HTTP client for the People tab (`/api/dev/people`).
 *
 * A person is an account, a public contributor profile, or both. The only
 * link between the two is the profile's membership email, which the admin
 * sets here with a picker; nothing is inferred from names, and the
 * email-derived key a first save may claim does not count as a link.
 */

import { sortRoster, type MemberRow } from "../members/membersModel";

/** One stored link: the profile `key` names the sign-in `membershipEmail`. */
export type ProfileLink = { key: string; membershipEmail: string };

/** What the People list needs from a directory profile. */
export type PeopleProfile = { key: string; displayName: string };

export type PeopleData = {
  /** The signed-in admin's email; their own account takes no actions. */
  self: string;
  members: MemberRow[];
  links: ProfileLink[];
};

/**
 * Why a person needs the admin's attention:
 * - `no-profile`: an account with no public profile linked to it.
 * - `unlinked-profile`: a public profile no account can edit.
 * - `no-account`: a profile linked to an email nobody signs in with.
 * - `shared-link`: a second profile linked to an account that already has one.
 */
export type PersonFlag = "no-profile" | "unlinked-profile" | "no-account" | "shared-link";

export const PERSON_FLAG_LABEL: Record<PersonFlag, string> = {
  "no-profile": "No public profile",
  "unlinked-profile": "Unlinked profile",
  "no-account": "Linked email has no account",
  "shared-link": "Account already has a profile",
};

export type Person = {
  /** `account:<email>` or `profile:<key>`: stable across reloads and links. */
  id: string;
  account: MemberRow | null;
  profileKey: string | null;
  /** The profile's display name, when the directory knows it. */
  profileName: string | null;
  /** The email the profile's link names; with no account, the email nobody holds. */
  linkedEmail: string | null;
  flag: PersonFlag | null;
};

export const accountPersonId = (email: string) => `account:${email.trim().toLowerCase()}`;
export const profilePersonId = (key: string) => `profile:${key}`;

/** The name a person reads as in the list and the view heading. */
export function personLabel(person: Person): string {
  return person.account?.username ?? person.profileName ?? person.account?.name ?? person.account?.email ?? person.profileKey ?? "";
}

/**
 * Every account and every profile, once each, accounts first in roster
 * order (admins, then by role and name). An account pairs with the first
 * profile (by key) whose membership email is its own; every other profile
 * stands alone, flagged for what is missing.
 */
export function pairPeople(data: PeopleData, profiles: readonly PeopleProfile[]): Person[] {
  const nameOf = new Map(profiles.map((profile) => [profile.key, profile.displayName]));
  const linksByEmail = new Map<string, ProfileLink[]>();
  for (const link of [...data.links].sort((left, right) => left.key.localeCompare(right.key))) {
    const email = link.membershipEmail.trim().toLowerCase();
    linksByEmail.set(email, [...(linksByEmail.get(email) ?? []), link]);
  }
  const accountEmails = new Set(data.members.map((member) => member.email.trim().toLowerCase()));
  const placed = new Set<string>();
  const people: Person[] = [];

  for (const account of sortRoster(data.members)) {
    const email = account.email.trim().toLowerCase();
    const [link, ...extra] = linksByEmail.get(email) ?? [];
    people.push({
      id: accountPersonId(email),
      account,
      profileKey: link?.key ?? null,
      profileName: link ? nameOf.get(link.key) ?? null : null,
      linkedEmail: link ? email : null,
      flag: link ? null : "no-profile",
    });
    if (link) placed.add(link.key);
    for (const other of extra) {
      placed.add(other.key);
      people.push(profileOnly(other.key, nameOf, email, "shared-link"));
    }
  }
  for (const [email, links] of linksByEmail) {
    if (accountEmails.has(email)) continue;
    for (const link of links) {
      placed.add(link.key);
      people.push(profileOnly(link.key, nameOf, email, "no-account"));
    }
  }
  for (const profile of profiles) {
    if (placed.has(profile.key)) continue;
    people.push(profileOnly(profile.key, nameOf, null, "unlinked-profile"));
  }
  return people;
}

function profileOnly(
  key: string,
  nameOf: ReadonlyMap<string, string>,
  linkedEmail: string | null,
  flag: PersonFlag,
): Person {
  return { id: profilePersonId(key), account: null, profileKey: key, profileName: nameOf.get(key) ?? null, linkedEmail, flag };
}

/**
 * The person a `/dev/people/<slug>` address names: an email opens that
 * account, anything else a profile key (case-insensitive either way).
 */
export function findPersonBySlug(people: readonly Person[], slug: string): Person | undefined {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return undefined;
  return wanted.includes("@")
    ? people.find((person) => person.account?.email.toLowerCase() === wanted)
    : people.find((person) => person.profileKey?.toLowerCase() === wanted);
}

export type PeopleView = "accounts" | "unlinked" | "all";

/** Accounts first (the roster), then everything a link would fix, then all. */
export function filterPeople(people: readonly Person[], view: PeopleView, search: string): Person[] {
  const needle = search.trim().toLowerCase();
  return people.filter((person) => {
    if (view === "accounts" && !person.account) return false;
    if (view === "unlinked" && person.flag === null) return false;
    if (!needle) return true;
    return [person.account?.email, person.account?.username, person.account?.name, person.profileKey, person.profileName]
      .some((value) => value?.toLowerCase().includes(needle));
  });
}

export async function fetchPeople(): Promise<PeopleData> {
  const payload = await requestJson("/api/dev/people", undefined, "Unable to load people.");
  return {
    self: typeof payload.self === "string" ? payload.self : "",
    members: Array.isArray(payload.members) ? (payload.members as MemberRow[]) : [],
    links: Array.isArray(payload.links) ? (payload.links as ProfileLink[]) : [],
  };
}

/**
 * Links `key` to the account `email`, or unlinks it with `null`. The write is
 * the contributor profile route's admin patch with the membership email and
 * nothing else, checked against the profile revision read just before, so a
 * colleague's newer save is refused rather than overwritten.
 */
export async function setProfileAccount(key: string, email: string | null): Promise<void> {
  const current = await requestJson(
    `/api/dev/contributor-profile?key=${encodeURIComponent(key)}`,
    undefined,
    "That profile could not be loaded.",
  );
  const profile = current.profile as { updatedAt?: string | null } | undefined;
  await requestJson(
    "/api/dev/contributor-profile",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        expectedUpdatedAt: profile?.updatedAt ?? null,
        membershipEmail: email,
      }),
    },
    email ? "The profile could not be linked." : "The profile could not be unlinked.",
  );
}

async function requestJson(url: string, init: RequestInit | undefined, failure: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = init ? await fetch(url, init) : await fetch(url);
  } catch {
    throw new Error("Network error. Nothing changed; try again.");
  }
  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : failure);
  }
  return payload;
}
