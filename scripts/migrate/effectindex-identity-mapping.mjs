/**
 * Pure mapping from the 2021 Effect Index export onto `contributorProfiles`
 * rows. Kept separate from the runner so the mapping can be tested without a
 * Postgres client, a network, or a filesystem.
 *
 * Two legacy bio dialects arrive here:
 *
 *   - `profiles.json.body` is GFM Markdown already, authored for the old Vue
 *     site's profile cards.
 *   - `people.json.bio.raw` is a bracket macro dialect (`[p]`, `[ul]`, `[li]`,
 *     `[ext-link to="…"]`) that the old renderer parsed into its own AST.
 *
 * `bio` on `contributorProfiles` is rendered by `ProfileBioMarkdown`
 * (react-markdown + remark-gfm + remark-breaks), so both dialects are converted
 * to plain GFM Markdown restricted to the element set that component styles:
 * paragraphs, strong, emphasis, links, lists, blockquotes. Headings are not in
 * that set, so a leading role heading is promoted to the `role` field and any
 * remaining heading becomes bold text — which is how the old site rendered an
 * `h4` inside a profile card anyway.
 */

const KNOWN_LEGACY_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "b",
  "strong",
  "i",
  "em",
  "blockquote",
  "ext-link",
  "int-link",
]);

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * The nine identities that had a public profile on effectindex.com, with the
 * legacy record keys each one's content is assembled from.
 *
 * `aliases` exists so old URLs and old credit strings keep resolving:
 * `/contributors/MARK GILLIS` and `/contributors/JOSIKINZ` both 301 to the
 * canonical key through the alias-aware public read.
 */
export const EFFECT_INDEX_IDENTITIES = [
  {
    key: "JOSIE",
    displayName: "Josie Kins",
    aliases: ["josie", "josikinz", "josie kins"],
    personKey: "josie",
    profileKey: "josie",
    // Owner decision (2026-07): Josie keeps her dose.wiki bio, links and
    // avatar. Her role is taken from the person record even though that record
    // is flagged not_public, because the flag governed the legacy person page,
    // not this title.
    roleOverride: "Founder",
  },
  { key: "VISCID", displayName: "Viscid", aliases: ["viscid", "mark gillis"], personKey: "viscid", profileKey: "viscid" },
  { key: "MAETHOR", displayName: "Maethor", aliases: ["maethor"], personKey: "maethor", profileKey: "maethor" },
  { key: "UTHERAPTOR", displayName: "utheraptor", aliases: ["utheraptor"], personKey: "utheraptor" },
  { key: "HYPNAGOGIST", displayName: "Hypnagogist", aliases: ["hypnagogist"], profileKey: "hypnagogist" },
  { key: "STINGRAYZ", displayName: "StingrayZ", aliases: ["stingrayz"], profileKey: "stingrayz" },
  { key: "RHO", displayName: "Rho", aliases: ["rho"], profileKey: "rho" },
  { key: "NATALIE", displayName: "Natalie", aliases: ["natalie"], profileKey: "natalie" },
  { key: "NERVEWING", displayName: "Nervewing", aliases: ["nervewing"], profileKey: "nervewing" },
];

function normalizeLegacyKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function tidyBlockSpacing(value) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Drop email addresses without dropping surrounding prose.
 *
 * A line-granularity filter is wrong here: StingrayZ's address sits at the end
 * of a sentence inside a substantive paragraph, so removing the line would take
 * his bio with it. Sentence granularity removes "He can be contacted at …"
 * while keeping the paragraph, and still removes a whole `- **Email** - …` list
 * item, because such an item is a single sentence with nothing else in it.
 *
 * Discord handles are kept. They were published on the same public profile
 * cards, the discriminator form stopped resolving to anything when Discord
 * retired discriminators, and the existing importer already treats them as
 * bio prose rather than contact data.
 */
export function redactEmails(value) {
  if (typeof value !== "string") {
    return "";
  }

  const lines = [];
  for (const line of value.split("\n")) {
    if (!EMAIL_PATTERN.test(line)) {
      lines.push(line);
      continue;
    }

    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !EMAIL_PATTERN.test(sentence))
      .join(" ");

    if (kept.trim()) {
      lines.push(kept);
      continue;
    }

    // An emptied list item is removed outright rather than left as a blank
    // line, which would split the surrounding list into a loose list and
    // change how the remaining items render.
    if (!/^\s*(?:[-*+]|\d+\.)\s/.test(line)) {
      lines.push("");
    }
  }

  return tidyBlockSpacing(lines.join("\n"));
}

/** Collect every bracket macro name used by a legacy `bio.raw` payload. */
export function collectLegacyTags(raw) {
  return new Set(
    Array.from(
      String(raw ?? "").matchAll(/\[\/?([a-z][a-z0-9-]*)(?=[\s\]])[^\]]*\]/gi),
      (match) => match[1].toLowerCase(),
    ),
  );
}

/**
 * Convert the `people.json` bracket macro dialect to GFM Markdown.
 *
 * Unknown macros throw rather than passing through as literal text: a silent
 * `[some-tag]` in a published bio is worse than a failed migration.
 */
export function legacyMarkupToMarkdown(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return "";
  }

  const unknown = [...collectLegacyTags(raw)].filter((tag) => !KNOWN_LEGACY_TAGS.has(tag));
  if (unknown.length > 0) {
    throw new Error(`Unhandled Effect Index bio macro(s): ${unknown.sort().join(", ")}`);
  }

  const converted = raw
    .replace(/\[ext-link\s+to=["']?([^"'\]]+)["']?\]([\s\S]*?)\[\/ext-link\]/gi, (_match, url, label) => {
      const text = label.trim() || url.trim();
      return `[${text}](${url.trim()})`;
    })
    // Legacy internal targets (/discord-chat, /summaries/…) have no dose.wiki
    // equivalent, so the anchor is flattened to its label instead of shipping a
    // link that 404s.
    .replace(/\[int-link\s+to=["']?[^"'\]]*["']?\]([\s\S]*?)\[\/int-link\]/gi, (_match, label) => label.trim())
    .replace(/\[(?:b|strong)\]([\s\S]*?)\[\/(?:b|strong)\]/gi, (_match, inner) => `**${inner.trim()}**`)
    .replace(/\[(?:i|em)\]([\s\S]*?)\[\/(?:i|em)\]/gi, (_match, inner) => `*${inner.trim()}*`)
    .replace(/\[blockquote\]([\s\S]*?)\[\/blockquote\]/gi, (_match, inner) => `> ${inner.trim()}`)
    .replace(/[ \t]*\[li\]([\s\S]*?)\[\/li\]/gi, (_match, inner) => `- ${inner.trim()}`)
    .replace(/\[\/?(?:ul|ol)\]/gi, "\n")
    .replace(/\[\/?p\]/gi, "\n");

  return tidyBlockSpacing(converted);
}

/**
 * Split a `profiles.json` body into its role heading and its Markdown bio.
 *
 * The old profile card rendered a leading `####` as the contributor's title
 * above the prose, which is exactly what the `role` field now holds. Headings
 * further down the body (StingrayZ's `#### SOCIAL MEDIA`) are section labels,
 * not titles, so they stay in the bio as bold text.
 */
export function splitLegacyRoleHeading(body) {
  const normalized = typeof body === "string" ? body.replace(/\r\n/g, "\n") : "";
  const match = /^\s*#{2,6}[ \t]+(.+?)[ \t]*(?:\n|$)/.exec(normalized);

  if (!match) {
    return { role: "", body: normalized };
  }

  return { role: match[1].trim(), body: normalized.slice(match[0].length) };
}

/** Convert a `profiles.json` Markdown body to the element set the bio renderer styles. */
export function normalizeLegacyMarkdownBody(body) {
  const { role, body: withoutHeading } = splitLegacyRoleHeading(body);

  const converted = withoutHeading
    .replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_match, text) => `**${text.trim()}**`)
    // Relative link targets pointed at legacy Effect Index routes.
    .replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]*\)/g, (_match, label) => label);

  return { role, body: redactEmails(tidyBlockSpacing(converted)) };
}

function hasSubstantiveBio(value) {
  return typeof value === "string" && value.replace(/[[\]_*`#>-]/g, "").trim().length >= 40;
}

function comparableBio(value) {
  return typeof value === "string"
    ? value
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase()
    : "";
}

function isSubstantiallyContained(candidate, container) {
  const candidateWords = comparableBio(candidate).split(" ").filter((word) => word.length > 2);
  const containerWords = new Set(comparableBio(container).split(" "));
  if (candidateWords.length === 0) {
    return true;
  }
  const matching = candidateWords.filter((word) => containerWords.has(word)).length;
  return matching / candidateWords.length >= 0.8;
}

function httpsLinksFromPerson(person) {
  const links = [];
  for (const social of Array.isArray(person?.social_media) ? person.social_media : []) {
    const value = typeof social?.value === "string" ? social.value.trim() : "";
    const label = typeof social?.type === "string" ? social.type.trim() : "";
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && label && links.length < 3) {
        links.push({ label, url: url.toString() });
      }
    } catch {
      // Bare handles and Discord tags are not URLs and stay out of the link row.
    }
  }
  return links;
}

/** Resolve the legacy bio and role for one identity from both source dialects. */
function resolveLegacyContent(definition, person, profile) {
  const personIsPrivate = Boolean(person?.not_public || person?.isPrivate);
  const publicPerson = personIsPrivate ? undefined : person;

  const fromProfile = normalizeLegacyMarkdownBody(profile?.body ?? "");
  const personBio = redactEmails(legacyMarkupToMarkdown(publicPerson?.bio?.raw ?? ""));

  const usePersonBio = !fromProfile.body && hasSubstantiveBio(personBio);
  const appendPersonBio = Boolean(
    fromProfile.body && hasSubstantiveBio(personBio) && !isSubstantiallyContained(personBio, fromProfile.body),
  );

  const bio = usePersonBio
    ? personBio
    : appendPersonBio
      ? `${fromProfile.body}\n\n${personBio}`
      : fromProfile.body;

  const personRole = typeof publicPerson?.role === "string" ? publicPerson.role.trim() : "";
  const role = definition.roleOverride || personRole || fromProfile.role;

  return {
    bio,
    role,
    bioSource: usePersonBio
      ? "person.bio.raw"
      : appendPersonBio
        ? "profile.body + person.bio.raw"
        : fromProfile.body
          ? "profile.body"
          : "none",
    roleSource: definition.roleOverride
      ? "owner-decision"
      : personRole
        ? "person.role"
        : fromProfile.role
          ? "profile.body-heading"
          : "none",
    links: httpsLinksFromPerson(publicPerson),
    personIsPrivate,
  };
}

/**
 * Build the `contributorProfiles.bulkImport` rows.
 *
 * `bulkImport` patches every field it is given, so each row is merged against
 * the existing record first and any non-empty stored value wins. That is also
 * what makes a second run a no-op: run one's output becomes run two's baseline,
 * and every branch below then takes the "preserve" path.
 */
export function buildIdentityRows({
  people = [],
  profiles = [],
  existingProfiles = new Map(),
  avatarUrlsByKey = new Map(),
  identities = EFFECT_INDEX_IDENTITIES,
  updatedBy = "import-effectindex-identities",
} = {}) {
  const peopleByKey = new Map(
    people.map((person) => [normalizeLegacyKey(person.profile_url || person.alias), person]),
  );
  const profilesByKey = new Map(
    profiles.map((profile) => [normalizeLegacyKey(profile.username), profile]),
  );

  const rows = [];
  const reports = [];

  for (const definition of identities) {
    const person = definition.personKey ? peopleByKey.get(definition.personKey) : undefined;
    const profile = definition.profileKey ? profilesByKey.get(definition.profileKey) : undefined;
    const existing = existingProfiles.get(definition.key) ?? null;
    const legacy = resolveLegacyContent(definition, person, profile);

    const existingDisplayName = existing?.displayName?.trim() ? existing.displayName : "";
    const existingBio = existing?.bio?.trim() ? existing.bio : "";
    const existingRole = existing?.role?.trim() ? existing.role.trim() : "";
    const existingLinks = Array.isArray(existing?.links) && existing.links.length > 0 ? existing.links : null;
    const stagedAvatarUrl = avatarUrlsByKey.get(definition.key) ?? "";

    const row = {
      key: definition.key,
      displayName: existingDisplayName || definition.displayName,
      aliases: Array.from(
        new Set([...(existing?.aliases ?? []), ...definition.aliases].map(normalizeLegacyKey).filter(Boolean)),
      ),
      bio: existingBio || legacy.bio,
      links: existingLinks ?? legacy.links,
      updatedBy,
    };

    const role = existingRole || legacy.role;
    if (role) {
      row.role = role;
    }
    if (existing?.avatarStorageId) {
      row.avatarStorageId = existing.avatarStorageId;
    }
    const avatarUrl = existing?.avatarUrl || stagedAvatarUrl;
    if (avatarUrl) {
      row.avatarUrl = avatarUrl;
    }
    if (existing?.membershipEmail) {
      row.membershipEmail = existing.membershipEmail;
    }
    if (existing?.createdAt) {
      row.createdAt = existing.createdAt;
    }

    rows.push(row);
    reports.push({
      key: definition.key,
      action: existing ? "UPDATE" : "CREATE",
      displayName: existingDisplayName ? "preserved-existing" : "filled-from-canonical",
      bio: existingBio ? "preserved-existing" : legacy.bio ? `filled-from-${legacy.bioSource}` : "empty-no-legacy-bio",
      bioLength: row.bio.length,
      role: role ? (existingRole ? "preserved-existing" : `filled-from-${legacy.roleSource}`) : "none",
      roleValue: role || null,
      links: existingLinks ? "preserved-existing" : legacy.links.length ? "filled-from-person.social_media" : "none-no-https-social-links",
      avatarUrl: existing?.avatarUrl
        ? "preserved-existing"
        : stagedAvatarUrl
          ? "filled-from-staged-public-asset"
          : "none-no-staged-asset",
      avatarStorageId: existing?.avatarStorageId ? "preserved-existing" : "not-set",
      aliasesAdded: row.aliases.filter(
        (alias) => !(existing?.aliases ?? []).map(normalizeLegacyKey).includes(alias),
      ),
      legacyPersonPrivate: person ? legacy.personIsPrivate : null,
    });
  }

  return { rows, reports };
}

/**
 * Lossless archive rows. Postgres reserves `$`-prefixed field names, which the
 * Mongo export uses ($oid, $date), so the verbatim JSON is stored as a string.
 */
export function buildArchiveEntries(people, profiles, posts, importedAt) {
  const verbatim = (payload) => JSON.stringify(payload);
  return [
    ...posts.map((payload) => ({ kind: "post", key: payload.slug, payload: verbatim(payload), importedAt })),
    ...people.map((payload) => ({
      kind: "person",
      key: normalizeLegacyKey(payload.profile_url || payload.alias),
      payload: verbatim(payload),
      importedAt,
    })),
    ...profiles.map((payload) => ({
      kind: "profile",
      key: normalizeLegacyKey(payload.username),
      payload: verbatim(payload),
      importedAt,
    })),
  ];
}

/** Last line of defence: no legacy address may reach a public bio. */
export function assertNoEmail(rows) {
  for (const row of rows) {
    if (EMAIL_PATTERN.test(row.bio)) {
      throw new Error(`Refusing to import an email address in ${row.key}'s public bio.`);
    }
  }
}
