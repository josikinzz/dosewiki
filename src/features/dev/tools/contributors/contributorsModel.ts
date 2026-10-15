export const MAX_BIO_LENGTH = 4000;
export { MAX_CONTRIBUTOR_PROFILE_LINKS as MAX_LINKS } from "@server/contributorProfileIdentity";
export const MAX_AVATAR_BYTES = 1024 * 1024 * 2;
export const ALLOWED_AVATAR_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type ContributorDirectoryEntry = {
  key: string;
  displayName: string;
  aliases: string[];
};

export type ContributorWork = {
  slug: string;
  title: string;
  artist: string;
  role: string;
  type: string;
  effectSlug: string | null;
  createdAt: string | null;
  thumbnailUrl: string | null;
};

export type ContributorReport = {
  slug: string;
  title: string;
  authorName: string;
  tripDate: string | null;
  featured: boolean;
};

export type EditorContributorProfile = {
  key: string;
  displayName: string;
  aliases: string[];
  bio: string;
  role: string | null;
  links: Array<{ label: string; url: string }>;
  membershipEmail: string | null;
  avatarUrl: string | null;
  avatarStorageId: string | null;
  storedAvatarUrl: string | null;
  replicationOrder: string[];
  orderingRevision?: string;
  reportOrder: string[];
  exclude_from_gallery: boolean;
  archival: boolean;
  approved_replicator: boolean;
  staffNote: { markdown: string; attribution?: string | null } | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type OrderSplit<Item> = {
  curated: Item[];
  auto: Item[];
  danglingSlugs: string[];
};

export function matchesContributorSearch(entry: ContributorDirectoryEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  if (entry.displayName.toLowerCase().includes(needle)) {
    return true;
  }
  if (entry.key.toLowerCase().includes(needle)) {
    return true;
  }

  return entry.aliases.some((alias) => alias.toLowerCase().includes(needle));
}

export function filterContributors<Entry extends ContributorDirectoryEntry>(
  entries: readonly Entry[],
  query: string,
): Entry[] {
  return entries.filter((entry) => matchesContributorSearch(entry, query));
}

export function splitByOrder<Item extends { slug: string }>(
  items: readonly Item[],
  order: readonly string[],
): OrderSplit<Item> {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const curated: Item[] = [];
  const danglingSlugs: string[] = [];
  const seen = new Set<string>();

  for (const slug of order) {
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);

    const item = bySlug.get(slug);
    if (item) {
      curated.push(item);
    } else {
      danglingSlugs.push(slug);
    }
  }

  return {
    curated,
    auto: items.filter((item) => !seen.has(item.slug)),
    danglingSlugs,
  };
}

export function curateSlug(order: readonly string[], slug: string, atIndex?: number): string[] {
  const without = order.filter((entry) => entry !== slug);
  const index =
    atIndex === undefined ? without.length : Math.max(0, Math.min(atIndex, without.length));
  return [...without.slice(0, index), slug, ...without.slice(index)];
}

export function uncurateSlug(order: readonly string[], slug: string): string[] {
  return order.filter((entry) => entry !== slug);
}

export function moveCuratedSlug(
  order: readonly string[],
  slug: string,
  direction: "up" | "down",
): string[] {
  const index = order.indexOf(slug);
  if (index < 0) {
    return [...order];
  }

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) {
    return [...order];
  }

  const next = [...order];
  next[index] = next[target];
  next[target] = slug;
  return next;
}

export function applyOrderDrag({
  order,
  activeSlug,
  overSlug,
  curatedSlugs,
}: {
  order: readonly string[];
  activeSlug: string;
  overSlug: string;
  curatedSlugs: readonly string[];
}): string[] {
  if (activeSlug === overSlug) {
    return [...order];
  }

  const curated = new Set(curatedSlugs);

  if (!curated.has(overSlug)) {
    return uncurateSlug(order, activeSlug);
  }

  const targetIndex = order.filter((slug) => slug !== activeSlug).indexOf(overSlug);
  const activeIndex = order.indexOf(activeSlug);
  const movingDown = activeIndex >= 0 && activeIndex < order.indexOf(overSlug);
  return curateSlug(order, activeSlug, movingDown ? targetIndex + 1 : targetIndex);
}

export function ordersEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((slug, index) => slug === right[index]);
}

function sortByDateDescending<Item>(
  items: readonly Item[],
  getDate: (item: Item) => string | null,
): Item[] {
  return [...items].sort((left, right) => {
    const leftDate = getDate(left) ?? "";
    const rightDate = getDate(right) ?? "";
    if (leftDate === rightDate) {
      return 0;
    }
    if (!leftDate) {
      return 1;
    }
    if (!rightDate) {
      return -1;
    }
    return rightDate.localeCompare(leftDate);
  });
}

export function sortWorks(works: readonly ContributorWork[]): ContributorWork[] {
  return sortByDateDescending(works, (work) => work.createdAt);
}

export function sortReports(reports: readonly ContributorReport[]): ContributorReport[] {
  return sortByDateDescending(reports, (report) => report.tripDate);
}

export type ContributorFormState = {
  displayName: string;
  bio: string;
  role: string;
  avatarUrl: string;
  aliases: string[];
  links: Array<{ label: string; url: string }>;
  exclude_from_gallery: boolean;
  archival: boolean;
  approved_replicator: boolean;
  staffNoteMarkdown: string;
  staffNoteAttribution: string;
};

export function toContributorForm(profile: EditorContributorProfile): ContributorFormState {
  return {
    displayName: profile.displayName ?? "",
    bio: profile.bio ?? "",
    role: profile.role ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    aliases: [...(profile.aliases ?? [])],
    links: (profile.links ?? []).map((link) => ({ ...link })),
    exclude_from_gallery: profile.exclude_from_gallery === true,
    archival: profile.archival === true,
    approved_replicator: profile.approved_replicator === true,
    staffNoteMarkdown: profile.staffNote?.markdown ?? "",
    staffNoteAttribution: profile.staffNote?.attribution ?? "",
  };
}

export function isContributorFormDirty(
  profile: EditorContributorProfile,
  form: ContributorFormState,
  hasAvatarUpload: boolean,
): boolean {
  if (hasAvatarUpload) {
    return true;
  }

  return JSON.stringify(toContributorForm(profile)) !== JSON.stringify(form);
}

export type OwnContributorPatch = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  links: Array<{ label: string; url: string }>;
};

export type ContributorPatch = OwnContributorPatch & {
  aliases: string[];
  role?: string | null;
  exclude_from_gallery?: boolean;
  archival?: boolean;
  approved_replicator?: boolean;
  staffNote?: { markdown: string; attribution?: string } | null;
};

export function buildContributorPatch(
  form: ContributorFormState,
  options: { canApprove: boolean },
): ContributorPatch {
  const editorPatch: ContributorPatch = {
    ...buildOwnContributorPatch(form),
    aliases: form.aliases.map((alias) => alias.trim()).filter(Boolean),
  };
  if (!options.canApprove) {
    return editorPatch;
  }
  return {
    ...editorPatch,
    role: form.role.trim() ? form.role.trim() : null,
    exclude_from_gallery: form.exclude_from_gallery,
    archival: form.archival,
    approved_replicator: form.approved_replicator,
    staffNote: form.staffNoteMarkdown.trim()
      ? {
          markdown: form.staffNoteMarkdown,
          ...(form.staffNoteAttribution.trim()
            ? { attribution: form.staffNoteAttribution.trim() }
            : {}),
        }
      : null,
  };
}

export function buildOwnContributorPatch(form: ContributorFormState): OwnContributorPatch {
  return {
    displayName: form.displayName.trim(),
    bio: form.bio,
    avatarUrl: form.avatarUrl.trim() ? form.avatarUrl.trim() : null,
    links: form.links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url),
  };
}

export function addAlias(aliases: readonly string[], candidate: string): string[] {
  const alias = candidate.trim();
  if (!alias) {
    return [...aliases];
  }
  if (aliases.some((entry) => entry.toLowerCase() === alias.toLowerCase())) {
    return [...aliases];
  }
  return [...aliases, alias];
}
