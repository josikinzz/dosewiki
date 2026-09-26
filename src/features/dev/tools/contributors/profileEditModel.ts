/**
 * Pure helpers for the profile editor's save dock and confirm: what changed,
 * the one reason Save is blocked, what each link row still needs, who may
 * write a record, and how a refused write reads. Kept free of React so the
 * rules can be tested without a DOM.
 */

import { deriveProfileKeyFromEmail, normalizeProfileKey } from "@server/contributorProfileIdentity";

import { MAX_BIO_LENGTH, toContributorForm, type ContributorFormState, type EditorContributorProfile } from "./contributorsModel";

type LinkDraft = { label: string; url: string };

/** What one link row still needs before it can be saved, or null when it is whole (or blank). */
export function linkProblem(link: LinkDraft): string | null {
  const label = link.label.trim();
  const url = link.url.trim();
  if (!label && !url) return null;
  if (!url) return "Add the address this link opens.";
  if (!label) return "Name this link, such as Portfolio.";
  // The server keeps only https addresses and drops the rest without a word.
  try {
    if (new URL(url).protocol !== "https:") return "Use an https:// address; other links are dropped on save.";
  } catch {
    return "Use a full address that starts with https://.";
  }
  return null;
}

/** `sanitizeContributorLinks` cuts a link label at this length. */
export const MAX_LINK_LABEL_LENGTH = 60;

/** Moves one link to `to`, keeping the rest in order. Out-of-range moves return a copy. */
export function moveLink<T>(links: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= links.length || to < 0 || to >= links.length || from === to) return [...links];
  const next = [...links];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The one sentence that says why Save cannot run yet, or null when it can.
 * Earlier a half-filled link was dropped silently on save; now it holds Save
 * and names the row.
 */
export function profileSaveBlocker(form: ContributorFormState): string | null {
  if (!form.displayName.trim()) return "Add a display name before saving.";
  if (form.bio.length > MAX_BIO_LENGTH) {
    return `The bio is ${form.bio.length - MAX_BIO_LENGTH} characters over the ${MAX_BIO_LENGTH} limit.`;
  }
  if (form.staffNoteMarkdown.length > MAX_BIO_LENGTH) {
    return `The editor's note is ${form.staffNoteMarkdown.length - MAX_BIO_LENGTH} characters over the limit.`;
  }
  const broken = form.links.findIndex((link) => linkProblem(link) !== null);
  if (broken >= 0) return `Link ${broken + 1}: ${linkProblem(form.links[broken])}`;
  return null;
}

const PART_LABELS: ReadonlyArray<[keyof ContributorFormState, string]> = [
  ["displayName", "name"],
  ["role", "credit title"],
  ["avatarUrl", "picture address"],
  ["bio", "bio"],
  ["links", "links"],
  ["aliases", "aliases"],
  ["exclude_from_gallery", "gallery setting"],
  ["archival", "archival flag"],
  ["approved_replicator", "approved replicator star"],
  ["staffNoteMarkdown", "editor's note"],
  ["staffNoteAttribution", "note attribution"],
];

/** The changed parts in reading order, as nouns ("name", "bio", "picture"). */
export function changedProfileParts(
  profile: EditorContributorProfile,
  form: ContributorFormState,
  avatar: { picked: boolean; removed: boolean },
): string[] {
  const saved = toContributorForm(profile);
  const parts = PART_LABELS.filter(([key]) => JSON.stringify(saved[key]) !== JSON.stringify(form[key])).map(([, label]) => label);
  if (avatar.picked) return ["picture", ...parts.filter((part) => part !== "picture address")];
  if (avatar.removed) return ["picture", ...parts.filter((part) => part !== "picture address")];
  return parts;
}

/** "the name, bio and links": a list as a sentence says it. */
export function joinProfileParts(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  const named = parts.map((part, index) => (index === 0 ? `the ${part}` : part));
  return named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/**
 * Mirrors the write rule in `canEditContributorProfile` (server/lib): an
 * admin writes any record; anyone else only the record linked to their
 * sign-in, or the unclaimed record their address derives to. With no viewer
 * address the tool cannot tell, so it leaves the record open and the route
 * decides, as it always has.
 */
export function canWriteContributorProfile({
  canApprove,
  viewerEmail,
  profile,
}: {
  canApprove: boolean;
  viewerEmail?: string | null;
  profile: Pick<EditorContributorProfile, "key" | "membershipEmail">;
}): boolean {
  if (canApprove || !viewerEmail) return true;
  const viewer = viewerEmail.trim().toLowerCase();
  const linked = profile.membershipEmail?.trim().toLowerCase() ?? "";
  if (linked) return linked === viewer;
  return normalizeProfileKey(profile.key) === deriveProfileKeyFromEmail(viewer);
}

export type WriteFailureKind = "conflict" | "frozen" | "refused" | "uncertain";

/** How a failed profile or order write reads: a revision conflict, the write freeze, a plain refusal, or a lost answer. */
export function classifyWriteFailure(status: number, message: string): WriteFailureKind {
  if (status === 409) return "conflict";
  if (/frozen|writes are paused/i.test(message)) return "frozen";
  if (status >= 500 || status === 0) return "uncertain";
  return "refused";
}

/** Error carrying the HTTP status, so the caller can tell a conflict from a refusal. */
export class ProfileWriteError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileWriteError";
    this.status = status;
  }
}

const TRUST_FLAGS: ReadonlyArray<[keyof Pick<ContributorFormState, "exclude_from_gallery" | "archival" | "approved_replicator">, string, string]> = [
  ["exclude_from_gallery", "Replications gallery", "hidden"],
  ["archival", "Archival profile", "on"],
  ["approved_replicator", "Approved replicator star", "on"],
];

/**
 * The admin flags a save flips, each from and to ("Archival profile: off to
 * on."), so the confirm names what the public page will say differently about
 * the person, not only that "the archival flag" changed.
 */
export function trustFlagChanges(profile: EditorContributorProfile, form: ContributorFormState): string[] {
  const saved = toContributorForm(profile);
  return TRUST_FLAGS.filter(([key]) => saved[key] !== form[key]).map(([key, label, onWord]) => {
    const word = (value: boolean) => (value ? onWord : onWord === "hidden" ? "shown" : "off");
    return `${label}: ${word(saved[key])} to ${word(form[key])}.`;
  });
}
