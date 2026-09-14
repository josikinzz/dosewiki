/**
 * Pure logic for the Contributors tab: directory search, the profile form, and
 * the curated / auto-ordered split the two reorder panels render.
 *
 * The curation model is partial on purpose, matching what
 * `setContributorOrdering` stores: an ordering is a short list of pinned slugs,
 * not a permutation of everything the contributor made. Items in the list come
 * first in exactly that order; everything else follows in the surface's own
 * default sort. That is why the panel draws a divider rather than one flat
 * list — the line is the boundary between "I decided this" and "whatever the
 * page would have done", and dragging across it is the curate/un-curate gesture.
 *
 * Kept free of React so the ordering rules can be tested without a DOM.
 */

export const MAX_BIO_LENGTH = 4000;
export { MAX_CONTRIBUTOR_PROFILE_LINKS as MAX_LINKS } from "@server/contributorProfileIdentity";
export const MAX_AVATAR_BYTES = 1024 * 1024 * 2; // 2 MiB
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
  /** Curated slugs that no longer resolve to an item; surfaced as a warning. */
  danglingSlugs: string[];
};

/**
 * Directory search across the three things an editor actually knows about a
 * contributor: the name on the page, the key in the URL, and the bylines the
 * profile answers to. Aliases matter most — the reason to open this tab is
 * usually a report credited to a name whose profile you cannot find.
 */
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

/**
 * Split items into the curated head and the auto-ordered tail.
 *
 * `items` must already be in the surface's default sort; this partitions and
 * never re-sorts. A curated slug with no item is reported rather than dropped
 * silently, because the server prunes those on the next save and an editor
 * should see what is about to disappear.
 */
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

/** Pin a slug, at the end of the curated list unless a position is given. */
export function curateSlug(order: readonly string[], slug: string, atIndex?: number): string[] {
  const without = order.filter((entry) => entry !== slug);
  const index =
    atIndex === undefined ? without.length : Math.max(0, Math.min(atIndex, without.length));
  return [...without.slice(0, index), slug, ...without.slice(index)];
}

/** Un-pin a slug; it falls back into the default sort with everything else. */
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

/**
 * Resolve one drag into a new ordering.
 *
 * Dropping onto a curated item takes that item's position — including when the
 * dragged item was not curated at all, which is how dragging across the divider
 * curates something. Dropping anywhere in the auto section (an un-curated slug,
 * or the section's own drop id) un-curates instead.
 */
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

/** Newest first, with undated rows last rather than sorted as the epoch. */
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
  membershipEmail: string;
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
    displayName: profile.displayName,
    bio: profile.bio,
    role: profile.role ?? "",
    membershipEmail: profile.membershipEmail ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    aliases: [...profile.aliases],
    links: profile.links.map((link) => ({ ...link })),
    // `=== true` rather than a passthrough: a deployment whose getEditorProfile
    // predates the flag hydrates this from JSON as undefined, which must read
    // as "included" and keep the checkbox controlled.
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

/**
 * The patch body for `/api/dev/contributor-profile`, shaped for the role that
 * is saving. `saveProfileAsEditor` refuses the trust fields (role, membership
 * email, gallery exclusion, archival, approved replicator, staff note) from
 * anyone below admin even when they are unchanged, so an editor's body must
 * not carry them at all.
 *
 * Emptied clearable fields become `null`, the only way a patch-only mutation
 * can be told to clear something rather than to leave it alone. `bio` is not
 * clearable that way: an empty bio is a stored empty string, and the public
 * page falls back to its generated blurb.
 */
export type OwnContributorPatch = {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  links: Array<{ label: string; url: string }>;
};

export type ContributorPatch = OwnContributorPatch & {
  aliases: string[];
  role?: string | null;
  membershipEmail?: string | null;
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
    membershipEmail: form.membershipEmail.trim() ? form.membershipEmail.trim() : null,
    exclude_from_gallery: form.exclude_from_gallery,
    archival: form.archival,
    approved_replicator: form.approved_replicator,
    // A blanked note clears the stored field (`null` is the patch spelling of
    // "delete"); the attribution only travels alongside a kept note.
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

/**
 * The part of the patch a contributor may set on their own record: name,
 * bio, avatar, links. Everything else on the form is editor-curated, and the
 * route refuses to write it for a session without editor role.
 */
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
