import { sortRoster, type MemberRow } from "../members/membersModel";
import { devFetch } from "@/features/dev/tools/devFetch";

export type ProfileLink = { key: string; membershipEmail: string };

export type PeopleProfile = { key: string; displayName: string };

export type PeopleData = {
  self: string;
  members: MemberRow[];
  links: ProfileLink[];
};

export type PersonFlag = "no-profile" | "unlinked-profile" | "no-account" | "shared-link";

export const PERSON_FLAG_LABEL: Record<PersonFlag, string> = {
  "no-profile": "No public profile",
  "unlinked-profile": "Unlinked profile",
  "no-account": "Linked email has no account",
  "shared-link": "Second profile on one account",
};

export type Person = {
  id: string;
  account: MemberRow | null;
  profileKey: string | null;
  profileName: string | null;
  linkedEmail: string | null;
  flag: PersonFlag | null;
};

export const accountPersonId = (email: string) => `account:${email.trim().toLowerCase()}`;
export const profilePersonId = (key: string) => `profile:${key}`;

export function personLabel(person: Person): string {
  return person.account?.username ?? person.profileName ?? person.account?.name ?? person.account?.email ?? person.profileKey ?? "";
}

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

export function findPersonBySlug(people: readonly Person[], slug: string): Person | undefined {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return undefined;
  return wanted.includes("@")
    ? people.find((person) => person.account?.email.toLowerCase() === wanted)
    : people.find((person) => person.profileKey?.toLowerCase() === wanted);
}

export type PeopleView = "accounts" | "unlinked" | "all";

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

export const PERSON_FLAG_ICON: Record<PersonFlag, string> = {
  "no-profile": "lucide:user-round-x",
  "unlinked-profile": "lucide:unlink",
  "no-account": "lucide:mail-x",
  "shared-link": "lucide:copy",
};

export const PEOPLE_VIEW_LABEL: Record<PeopleView, string> = {
  accounts: "Accounts",
  unlinked: "Needs a link",
  all: "Everyone",
};

export const PEOPLE_VIEW_EMPTY: Record<PeopleView, string> = {
  accounts: "No accounts yet. Invite someone to create one.",
  unlinked: "Everyone is linked.",
  all: "Nobody here yet.",
};

export function countPeople(people: readonly Person[]): Record<PeopleView, number> {
  return {
    accounts: people.filter((person) => person.account).length,
    unlinked: people.filter((person) => person.flag !== null).length,
    all: people.length,
  };
}

export function personRowDetail(person: Person): string {
  if (person.account && person.profileName && person.profileName !== personLabel(person)) return `Profile: ${person.profileName}`;
  if (person.account) return person.account.email;
  return person.profileKey ?? "";
}

export function isFrozenWriteMessage(message: string): boolean {
  return /frozen|writes are paused/i.test(message);
}

export async function fetchPeople(): Promise<PeopleData> {
  const payload = await requestJson("/api/dev/people", undefined, "Unable to load people.");
  return {
    self: typeof payload.self === "string" ? payload.self : "",
    members: Array.isArray(payload.members) ? (payload.members as MemberRow[]) : [],
    links: Array.isArray(payload.links) ? (payload.links as ProfileLink[]) : [],
  };
}

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

function requestJson(url: string, init: RequestInit | undefined, failure: string) {
  return devFetch(url, {
    ...init,
    messages: { network: "Network error. Nothing changed; try again.", failure },
    emptyBodyOk: true,
  });
}
