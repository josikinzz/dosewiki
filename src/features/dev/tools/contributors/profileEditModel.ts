import { deriveProfileKeyFromEmail, normalizeProfileKey } from "@server/contributorProfileIdentity";

import { MAX_BIO_LENGTH, toContributorForm, type ContributorFormState, type EditorContributorProfile } from "./contributorsModel";

type LinkDraft = { label: string; url: string };

export function linkProblem(link: LinkDraft): string | null {
  const label = link.label.trim();
  const url = link.url.trim();
  if (!label && !url) return null;
  if (!url) return "Add the address this link opens.";
  if (!label) return "Name this link, such as Portfolio.";
  try {
    if (new URL(url).protocol !== "https:") return "Use an https:// address; other links are dropped on save.";
  } catch {
    return "Use a full address that starts with https://.";
  }
  return null;
}

export const MAX_LINK_LABEL_LENGTH = 60;

export function moveLink<T>(links: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= links.length || to < 0 || to >= links.length || from === to) return [...links];
  const next = [...links];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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

export function joinProfileParts(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  const named = parts.map((part, index) => (index === 0 ? `the ${part}` : part));
  return named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

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

export function classifyWriteFailure(status: number, message: string): WriteFailureKind {
  if (status === 409) return "conflict";
  if (/frozen|writes are paused/i.test(message)) return "frozen";
  if (status >= 500 || status === 0) return "uncertain";
  return "refused";
}

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

export function trustFlagChanges(profile: EditorContributorProfile, form: ContributorFormState): string[] {
  const saved = toContributorForm(profile);
  return TRUST_FLAGS.filter(([key]) => saved[key] !== form[key]).map(([key, label, onWord]) => {
    const word = (value: boolean) => (value ? onWord : onWord === "hidden" ? "shown" : "off");
    return `${label}: ${word(saved[key])} to ${word(form[key])}.`;
  });
}
