#!/usr/bin/env node
/**
 * Give every credited name in the corpus a profile row.
 *
 * Two hundred and forty-seven replications and one hundred and sixty-four trip
 * reports credit ninety-odd distinct names. Thirteen of them have a profile.
 * The rest are free text: they render as plain strings, they link nowhere, and
 * nothing in the database says who they are. This script closes that gap.
 *
 * ## Everyone on the same terms
 *
 * The owner's ruling: give every credited name "their own profile page like
 * anyone else". So there is no contributor-versus-attribution split here, no
 * special handling for Zdzisław Beksiński or H. R. Giger or Tame Impala, and
 * nothing held back for a later decision. One shape, one set of defaults,
 * everybody.
 *
 * That has a public consequence, because the same table feeds the About page's
 * contributor roster: the roster grows from twelve names to eighty-three, and
 * the third parties are on it. Every run prints the exact before/after and
 * names every profile that newly appears, because that page is what the owner
 * is actually approving when they approve this import.
 *
 * ## The two things that make this delicate
 *
 * **Matching is exact.** `contributorMatchNames` resolves a credit line to a
 * profile by whole normalized name — display name or alias, nothing else. So a
 * spelling that is not literally recorded does not match, and the aliases below
 * are the whole of the join.
 *
 * **The stored spelling is not always the artist's name.** Five of them are
 * corruptions — Ben Ridgeway is Ben Ridgway, Simon Haid is Simon Haiduk — and a
 * long tail of stored `artist_url`s are dead, or answer 200 while belonging to
 * somebody else entirely. Those decisions live in
 * `src/data/config/contributorIdentityCorrections.json`, each with its evidence
 * and a strong/weak/needs-owner marker; only `strong` is applied, and the run
 * prints everything else for the owner. Correcting the name here does not
 * correct `replications.artist` — see
 * `scripts/replications/plan-artist-name-corrections.mjs` for that half.
 *
 * **The largest artist in the corpus is already here under another name.**
 * "Symmetric Vision" credits sixty works, 24% of the gallery, and it is
 * StingrayZ — whose profile currently matches zero works. That is an alias
 * addition, never a new profile: a new one would split the biggest artist in
 * the archive in half and leave both halves looking minor.
 *
 * Dry run (default):
 *   node scripts/contributors/seed-credited-identities.mjs
 *
 * Apply:
 *   node scripts/contributors/seed-credited-identities.mjs --write \
 *     --confirm-write=seed-credited-contributor-profiles \
 *     --expected-deployment=<fingerprint>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "seed-credited-contributor-profiles";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The reviewed corrections dataset.
 *
 * Deriving a display name from `replications.artist` and a link from
 * `replications.artist_url` is how this import started, and for most of the
 * corpus it is right. For a handful of names it is wrong in a way that would be
 * published: five stored spellings are corruptions of a real artist's real name,
 * and a long tail of stored URLs are dead, are traps that answer 200 while
 * belonging to someone else, or point at one artwork rather than at a person.
 *
 * Those decisions live in JSON rather than in this file so the reviewable
 * artifact is a list of claims with evidence attached, not a diff of code. The
 * script applies the ones marked `strong` and prints everything else.
 */
export const CORRECTIONS_PATH = path.join(
  ROOT,
  "src/data/config/contributorIdentityCorrections.json",
);

export function loadIdentityCorrections(filePath = CORRECTIONS_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** `sanitizeContributorLinks` keeps three; planning to more would silently drop the tail. */
const MAX_PROFILE_LINKS = 3;

/**
 * Strings that mean "nobody recorded this", not people. Exact stored spellings,
 * compared case-insensitively. These get no profile: a page for "Unknown" would
 * collect twenty unrelated works under one identity that does not exist.
 */
export const ABSENCE_MARKERS = Object.freeze([
  "Anonymous", // 22 trip reports
  "Unknown", // 20 replications
  "midjourney", // 2 replications — a tool, not a person
  "various artists", // 1 replication
]);

/**
 * Recognizable third parties: painters, photographers and bands whose work the
 * archive reproduces. They are seeded exactly like everyone else — the owner
 * asked for no special handling — and this list exists only so the run can point
 * at them by name in the roster-impact report. These are the names most likely
 * to surprise someone looking at the published contributor page, so the report
 * says out loud that they will be on it.
 *
 * Purely a display annotation. Nothing here changes what is written.
 */
export const NOTABLE_THIRD_PARTIES = Object.freeze([
  "Zdzisław Beksiński",
  "H. R. Giger",
  "David Hockney",
  "Bev Doolittle",
  "Tame Impala",
  "Alex Grey",
]);

/**
 * Keys that must not be derived.
 *
 * The derivation keeps `[A-Za-z0-9-]` and uppercases, which is right for ASCII
 * handles and lossy for anything else: "Zdzisław Beksiński" derives to
 * ZDZISAWBEKSISKI, silently dropping both Polish letters and leaving a key that
 * cannot be read back to the name. The transliteration below is the same one
 * the replication slug normalizer uses (ł → l, ń → n).
 *
 * Keyed by lowercased display name.
 */
export const EXPLICIT_PROFILE_KEYS = Object.freeze({
  "zdzisław beksiński": "ZDZISLAWBEKSINSKI",
});

/**
 * Spellings that belong to a profile that already exists. Each one is a merge
 * decision with evidence, not a guess, so they are listed rather than inferred.
 */
export const ALIAS_ADDITIONS = Object.freeze([
  {
    key: "STINGRAYZ",
    aliases: ["symmetric vision"],
    evidence:
      "60 works (24% of the gallery) are credited to 'Symmetric Vision'; 35 of them name " +
      "rightsholder 'StingrayZ' and none names anyone else. Their artist_urls " +
      "(gfycat.com/@StingrayZ, patreon.com/stingrayz, instagram.com/inner.reflection) are the " +
      "handles listed in the STINGRAYZ profile bio, which also names facebook.com/symmetryinvisioned.",
  },
  {
    key: "RHO",
    aliases: ["pluralist visuals"],
    evidence:
      "RHO's bio lists 'Instagram - instagram.com/pluralist.visuals' and RHO's stored role is " +
      "'Replication Artist', yet RHO currently matches zero works.",
  },
  {
    key: "LYREA",
    aliases: ["lyrea"],
    evidence:
      "LYREA's aliases are ['witchy'] — her own name is missing, so she matches only through " +
      "her display name. Recording it makes the two channels agree.",
  },
]);

/**
 * Hosts confirmed to answer over HTTPS, so an `http://` artist_url can be
 * upgraded rather than dropped. Probed 2026-08-10; the status is what the host
 * returned for the exact stored path.
 */
export const HTTPS_VERIFIED_HOSTS = Object.freeze({
  "en.wikipedia.org": "200",
  "chelseamorganart.co.uk": "200",
  "www.flickr.com": "200",
  "www.wired.co.uk": "301 to https://www.wired.com/...",
  "waruzimu.deviantart.com": "301 to https://www.deviantart.com/moracz/...",
  "artcollider.net": "404 over HTTPS, and the http:// URL 301s to the https:// one",
});

/**
 * Hosts that do not answer over HTTPS at all, so upgrading would invent a link
 * that does not exist. Probed 2026-08-10.
 */
export const HTTPS_UNAVAILABLE_HOSTS = Object.freeze({
  "www.emptykingdom.com": "HTTPS connect timeout; the http:// URL returns 500 — the site is down",
  "www.zensages.com": "NXDOMAIN over both schemes — the domain no longer resolves",
});

const NOTABLE_THIRD_PARTY_NAMES = new Set(NOTABLE_THIRD_PARTIES.map((name) => name.toLowerCase()));

/**
 * Names that might belong to a profile that already exists, on evidence too
 * thin to act on. Each gets its own profile here, which is the reversible
 * choice: `renameKey` folds a standalone profile into another one later, while
 * an alias applied wrongly quietly attributes one person's work to another.
 */
export const POSSIBLE_MERGES = Object.freeze([
  {
    displayName: "BluuRae",
    candidateKey: "NATALIE",
    evidence:
      "NATALIE's bio gives 'my Discord handle is Bluu#9204'; three trip reports are authored by " +
      "'BluuRae'. Nothing links the Discord handle to the report author string directly.",
  },
  {
    displayName: "Pluralist-Art",
    candidateKey: "RHO",
    evidence:
      "Shares the 'pluralist' handle stem with RHO's instagram.com/pluralist.visuals, but no " +
      "rightsholder, email or profile_key ties the report to RHO. (The replication artist string " +
      "'pluralist visuals' is a separate, well-evidenced case and is being aliased onto RHO.)",
  },
]);

/* ------------------------------------------------------------------------ identity */

export function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeKey(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isAbsenceMarker(displayName) {
  return ABSENCE_MARKERS.some((marker) => normalizeName(marker) === normalizeName(displayName));
}

/**
 * The stored key for a display name. Explicit first, then the same derivation
 * the live keys use — keep `[A-Za-z0-9-]`, uppercase.
 *
 * Returns the loss alongside the key rather than swallowing it, so a name that
 * cannot survive the derivation is reported instead of quietly mangled.
 */
export function deriveProfileKey(displayName) {
  const explicit = EXPLICIT_PROFILE_KEYS[normalizeName(displayName)];
  if (explicit) {
    return { key: normalizeKey(explicit), explicit: true, droppedCharacters: [] };
  }

  const droppedCharacters = Array.from(String(displayName ?? ""))
    .filter((character) => !/[A-Za-z0-9-]/.test(character) && /[\p{L}\p{N}]/u.test(character));

  return {
    key: String(displayName ?? "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase(),
    explicit: false,
    droppedCharacters,
  };
}

/**
 * Every name the corpus credits, with where it was credited and what URLs
 * travelled with it. Insertion order is not relied on anywhere; the result is
 * sorted, so repeated runs produce an identical plan.
 */
export function collectCreditedIdentities({ replications = [], reports = [] } = {}) {
  const identities = new Map();

  const touch = (rawName) => {
    const displayName = typeof rawName === "string" ? rawName.trim() : "";
    if (!displayName) {
      return null;
    }

    const normalized = normalizeName(displayName);
    let identity = identities.get(normalized);

    if (!identity) {
      identity = {
        displayName,
        normalizedName: normalized,
        spellings: new Set([displayName]),
        replications: 0,
        reports: 0,
        urlCounts: new Map(),
      };
      identities.set(normalized, identity);
    }

    identity.spellings.add(displayName);
    return identity;
  };

  for (const replication of replications) {
    const identity = touch(replication?.artist);
    if (!identity) {
      continue;
    }

    identity.replications += 1;

    const url = typeof replication?.artist_url === "string" ? replication.artist_url.trim() : "";
    if (url) {
      identity.urlCounts.set(url, (identity.urlCounts.get(url) ?? 0) + 1);
    }
  }

  for (const report of reports) {
    const identity = touch(report?.subject?.name);
    if (identity) {
      identity.reports += 1;
    }
  }

  return Array.from(identities.values())
    .map((identity) => ({
      ...identity,
      // The most-used spelling wins the display name; ties break lexically.
      spellings: Array.from(identity.spellings).sort((left, right) => left.localeCompare(right)),
      urls: Array.from(identity.urlCounts.entries())
        .map(([url, count]) => ({ url, count }))
        .sort((left, right) => right.count - left.count || left.url.localeCompare(right.url)),
    }))
    .map(({ urlCounts: _urlCounts, ...identity }) => identity)
    .sort(
      (left, right) =>
        right.replications + right.reports - (left.replications + left.reports) ||
        left.normalizedName.localeCompare(right.normalizedName),
    );
}

/* ----------------------------------------------------------------- corrections index */

/** Only `strong` is actionable. Everything else is recorded and printed. */
export const APPLIED_STRENGTH = "strong";

/**
 * Compare two URLs the way a reader would: scheme and a trailing slash are not
 * what makes a link a different link. Query strings are kept, because
 * `?hl=en` is part of the stored value and matching it loosely would let a
 * removal silently catch more than it names.
 */
export function linkIdentity(url) {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

export function buildCorrectionIndex(corrections = {}) {
  const names = new Map();
  const inertNames = [];
  for (const entry of corrections.nameCorrections ?? []) {
    if (entry.strength === APPLIED_STRENGTH) {
      names.set(normalizeName(entry.stored), entry);
    } else {
      inertNames.push(entry);
    }
  }

  const links = new Map();
  const inertLinks = [];
  for (const entry of corrections.linkCorrections ?? []) {
    if (entry.strength === APPLIED_STRENGTH) {
      links.set(normalizeName(entry.artist), entry);
    } else {
      inertLinks.push(entry);
    }
  }

  const blockedUrls = new Map(
    (corrections.blockedUrls ?? []).map((entry) => [linkIdentity(entry.url), entry.reason]),
  );
  const blockedHosts = new Map(
    (corrections.blockedHosts ?? []).map((entry) => [entry.host.toLowerCase(), entry.reason]),
  );

  return {
    names,
    links,
    inertNames,
    inertLinks,
    blockedUrls,
    blockedHosts,
    ownerDecisions: corrections.ownerDecisions ?? [],
    checkedAndFoundWrong: corrections.checkedAndFoundWrong ?? [],
  };
}

/**
 * Why a URL must never be published, or null if it may be.
 *
 * A trap is the failure this whole pass exists to prevent: `benridgway.com`
 * answers 200 and is a lapsed-domain parking page, `neilusher.com` answers 200
 * and is an estate agent in Ottawa. Neither is caught by any status check, so
 * they are caught by name.
 */
export function blockedReason(url, index) {
  const byUrl = index.blockedUrls.get(linkIdentity(url));
  if (byUrl) {
    return byUrl;
  }

  let hostname = null;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  return (
    index.blockedHosts.get(hostname) ??
    index.blockedHosts.get(hostname.replace(/^www\./, "")) ??
    null
  );
}

/* --------------------------------------------------------------------------- links */

function dedupeKeyFor(href) {
  return href.replace(/\/+$/, "");
}

function labelFor(hostname) {
  return hostname.replace(/^www\./, "");
}

/**
 * Turn an artist's `artist_url` values into profile links, and account for
 * every value that does not make it.
 *
 * `sanitizeContributorLinks` accepts HTTPS only and keeps three, so anything
 * this function does not resolve would be dropped by the mutation without a
 * word. Dropping it here instead means the run can say what was lost and why.
 */
export function planProfileLinks(urls = [], { correction = null } = {}) {
  const links = [];
  const upgraded = [];
  const dropped = [];
  const truncated = [];
  const added = [];
  const removed = [];
  const seen = new Set();

  const push = (href, extra = {}) => {
    const dedupeKey = dedupeKeyFor(href);
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);

    if (links.length >= MAX_PROFILE_LINKS) {
      truncated.push({ url: href, ...extra });
      return false;
    }

    links.push({ label: labelFor(new URL(href).hostname), url: href });
    return true;
  };

  // Curated links go first. They were chosen as the artist's own home, so when
  // the three-link cap bites it should bite the per-work URLs the corpus
  // happened to store, not the page a reader actually wants.
  for (const entry of correction?.add ?? []) {
    let parsed = null;
    try {
      parsed = new URL(entry.url);
    } catch {
      parsed = null;
    }

    if (!parsed || parsed.protocol !== "https:") {
      dropped.push({
        url: entry.url,
        count: 0,
        reason: "correction supplied a link that is not an https URL",
      });
      continue;
    }

    if (push(parsed.toString())) {
      added.push({ url: parsed.toString(), evidence: entry.evidence, verification: entry.verification });
    }
  }

  const removals = new Map(
    (correction?.remove ?? []).map((entry) => [linkIdentity(entry.url), entry.reason]),
  );

  for (const { url, count } of urls) {
    // Checked before parsing: a removed URL should be reported with the reason
    // the review recorded, not with whatever the parser would have said about
    // it. "NXDOMAIN" is true of zensages.com and much less useful than knowing
    // it was the artist's own site until 2021 and is now gone for good.
    const removalReason = removals.get(linkIdentity(url));
    if (removalReason) {
      removed.push({ url, count, reason: removalReason });
      continue;
    }

    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      // A bare `host/path` is a URL missing its scheme, which is a repair, not a
      // parse. Suggest it and let a human approve it; guessing the scheme for
      // the reader is how a wrong link becomes a durable one.
      const looksSchemeless = /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(url);
      dropped.push({
        url,
        count,
        reason: looksSchemeless ? "no URL scheme" : "not a URL",
        ...(looksSchemeless ? { suggestedRepair: `https://${url}` } : {}),
      });
      continue;
    }

    if (parsed.protocol === "http:") {
      if (!Object.hasOwn(HTTPS_VERIFIED_HOSTS, parsed.hostname)) {
        dropped.push({
          url,
          count,
          reason:
            HTTPS_UNAVAILABLE_HOSTS[parsed.hostname] ??
            `host ${parsed.hostname} is not on the HTTPS-verified list`,
        });
        continue;
      }

      parsed.protocol = "https:";
      upgraded.push({
        from: url,
        to: parsed.toString(),
        count,
        evidence: HTTPS_VERIFIED_HOSTS[parsed.hostname],
      });
    } else if (parsed.protocol !== "https:") {
      dropped.push({ url, count, reason: `unsupported scheme ${parsed.protocol}` });
      continue;
    }

    push(parsed.toString(), { count });
  }

  return { links, upgraded, dropped, truncated, added, removed };
}

/* ---------------------------------------------------------------------------- plan */

function matchNamesOf(profile) {
  return new Set(
    [profile.displayName, ...(profile.aliases ?? [])].map(normalizeName).filter(Boolean),
  );
}

/**
 * Build the whole plan: which aliases to add, which profiles to create, what
 * every one of them will contain, and everything deliberately left alone.
 *
 * Alias additions are resolved first and on purpose. Once STINGRAYZ answers to
 * "symmetric vision", those sixty works stop looking like an unclaimed identity
 * and no new profile is proposed for them.
 */
export function buildSeedPlan({
  replications = [],
  reports = [],
  profiles = [],
  corrections = loadIdentityCorrections(),
} = {}) {
  const index = buildCorrectionIndex(corrections);
  const identities = collectCreditedIdentities({ replications, reports });
  const identityByName = new Map(identities.map((identity) => [identity.normalizedName, identity]));
  const profileByKey = new Map(profiles.map((profile) => [normalizeKey(profile.key), profile]));

  const aliasAdditions = [];
  const aliasWarnings = [];
  const matchNamesByKey = new Map(
    profiles.map((profile) => [normalizeKey(profile.key), matchNamesOf(profile)]),
  );

  for (const addition of ALIAS_ADDITIONS) {
    const key = normalizeKey(addition.key);
    const profile = profileByKey.get(key);

    if (!profile) {
      aliasWarnings.push(`Profile ${key} does not exist; alias addition skipped.`);
      continue;
    }

    const existingNames = matchNamesByKey.get(key);
    const newAliases = addition.aliases.map(normalizeName).filter(Boolean);
    const missing = newAliases.filter((alias) => !(profile.aliases ?? []).map(normalizeName).includes(alias));

    for (const alias of newAliases) {
      existingNames.add(alias);
      const identity = identityByName.get(alias);
      if (!identity) {
        aliasWarnings.push(
          `Alias "${alias}" on ${key} matches nothing in the corpus — recorded, but it joins no works.`,
        );
      }
    }

    aliasAdditions.push({
      key,
      displayName: profile.displayName,
      aliases: newAliases,
      missing,
      alreadyPresent: missing.length === 0,
      claims: newAliases.reduce(
        (total, alias) => {
          const identity = identityByName.get(alias);
          return {
            replications: total.replications + (identity?.replications ?? 0),
            reports: total.reports + (identity?.reports ?? 0),
          };
        },
        { replications: 0, reports: 0 },
      ),
      evidence: addition.evidence,
    });
  }

  const resolveExisting = (normalizedName) => {
    for (const [key, names] of matchNamesByKey) {
      if (names.has(normalizedName)) {
        return key;
      }
    }
    return null;
  };

  const created = [];
  const absenceMarkers = [];
  const alreadyResolved = [];
  const linkNotes = [];
  const nameCorrectionsApplied = [];
  const usedNameCorrections = new Set();
  const usedLinkCorrections = new Set();

  for (const identity of identities) {
    if (isAbsenceMarker(identity.displayName)) {
      absenceMarkers.push({
        displayName: identity.displayName,
        replications: identity.replications,
        reports: identity.reports,
      });
      continue;
    }

    const existingKey = resolveExisting(identity.normalizedName);
    if (existingKey) {
      alreadyResolved.push({ displayName: identity.displayName, key: existingKey });
      continue;
    }

    const nameCorrection = index.names.get(identity.normalizedName) ?? null;
    if (nameCorrection) {
      usedNameCorrections.add(identity.normalizedName);
    }

    const displayName = nameCorrection ? nameCorrection.correct : identity.displayName;
    const { key, explicit, droppedCharacters } = deriveProfileKey(displayName);

    const linkCorrection = index.links.get(identity.normalizedName) ?? null;
    if (linkCorrection) {
      usedLinkCorrections.add(identity.normalizedName);
    }

    const { links, upgraded, dropped, truncated, added, removed } = planProfileLinks(
      identity.urls,
      { correction: linkCorrection },
    );

    if (
      upgraded.length > 0 ||
      dropped.length > 0 ||
      truncated.length > 0 ||
      added.length > 0 ||
      removed.length > 0
    ) {
      linkNotes.push({ displayName, storedAs: identity.displayName, upgraded, dropped, truncated, added, removed });
    }

    // Both spellings, always. Before the replication rows are corrected the
    // corpus still says "Ben Ridgeway", and after they are corrected it says
    // "Ben Ridgway"; matching is by whole normalized name, so a profile that
    // knows only one of them goes blank on one side of that change.
    const aliases = Array.from(
      new Set([...identity.spellings.map(normalizeName), normalizeName(displayName)]),
    )
      .filter(Boolean)
      .sort();

    if (nameCorrection) {
      nameCorrectionsApplied.push({
        key,
        storedAs: identity.displayName,
        correctedTo: displayName,
        works: identity.replications,
        reports: identity.reports,
        aliases,
        evidence: nameCorrection.evidence,
        correctsReplicationArtistField: nameCorrection.correctsReplicationArtistField === true,
      });
    }

    created.push({
      key,
      explicitKey: explicit,
      droppedCharacters,
      displayName,
      // Every spelling the corpus uses, because exact matching means an
      // unrecorded spelling matches nothing at all.
      aliases,
      bio: "",
      links,
      // One rule for everybody: a name credited on a replication is a
      // replication artist. No name is exempted and none is singled out.
      ...(identity.replications > 0 ? { role: "Replication Artist" } : {}),
      sources: { replications: identity.replications, reports: identity.reports },
      notableThirdParty: NOTABLE_THIRD_PARTY_NAMES.has(identity.normalizedName),
    });
  }

  // A correction that matches nothing is a typo in the corrections file, or a
  // name that has already moved. Either way it is silent unless it is said out
  // loud, and a silent no-op in a file whose whole job is to prevent a wrong
  // publication is the wrong kind of quiet.
  const unmatchedCorrections = [
    ...[...index.names.keys()]
      .filter((name) => !usedNameCorrections.has(name))
      .map((name) => ({ kind: "nameCorrection", name })),
    ...[...index.links.keys()]
      .filter((name) => !usedLinkCorrections.has(name))
      .map((name) => ({ kind: "linkCorrection", name })),
  ];

  const blockedLinks = [];
  for (const row of created) {
    for (const link of row.links) {
      const reason = blockedReason(link.url, index);
      if (reason) {
        blockedLinks.push({ key: row.key, displayName: row.displayName, url: link.url, reason });
      }
    }
  }

  return {
    aliasAdditions,
    aliasWarnings,
    nameCorrectionsApplied,
    inertNameCorrections: index.inertNames,
    inertLinkCorrections: index.inertLinks,
    ownerDecisions: index.ownerDecisions,
    checkedAndFoundWrong: index.checkedAndFoundWrong,
    unmatchedCorrections,
    blockedLinks,
    created: created.sort((left, right) => left.key.localeCompare(right.key)),
    absenceMarkers,
    alreadyResolved,
    linkNotes,
    collisions: findCollisions({ created, profiles, aliasAdditions }),
    possibleMerges: POSSIBLE_MERGES.filter((merge) =>
      created.some((row) => normalizeName(row.displayName) === normalizeName(merge.displayName)),
    ).map((merge) => ({
      ...merge,
      key: created.find((row) => normalizeName(row.displayName) === normalizeName(merge.displayName))
        .key,
    })),
  };
}

/**
 * Everything that would make two identities collapse into one.
 *
 * The third check is the non-obvious one: the public read drops any profile
 * whose key equals another profile's alias (that is how renamed keys stay
 * hidden), so a new key that happens to match an existing alias would create a
 * page that never renders.
 */
export function findCollisions({ created = [], profiles = [], aliasAdditions = [] } = {}) {
  const existingKeys = new Set(profiles.map((profile) => normalizeKey(profile.key)));
  const aliasesByKey = new Map(
    profiles.map((profile) => [normalizeKey(profile.key), new Set((profile.aliases ?? []).map(normalizeName))]),
  );
  for (const addition of aliasAdditions) {
    for (const alias of addition.aliases) {
      aliasesByKey.get(addition.key)?.add(alias);
    }
  }
  const allAliases = new Set([...aliasesByKey.values()].flatMap((set) => [...set]));

  const duplicateKeys = [];
  const keyMatchesExistingProfile = [];
  const keyShadowedByAlias = [];
  const aliasClaimsExistingName = [];

  const seenKeys = new Set();
  const existingNames = new Set(
    profiles.flatMap((profile) => [...matchNamesOf(profile)]),
  );

  for (const row of created) {
    if (seenKeys.has(row.key)) {
      duplicateKeys.push(row.key);
    }
    seenKeys.add(row.key);

    if (existingKeys.has(row.key)) {
      keyMatchesExistingProfile.push(row.key);
    }

    if (allAliases.has(row.key.toLowerCase())) {
      keyShadowedByAlias.push(row.key);
    }

    for (const alias of row.aliases) {
      if (existingNames.has(alias)) {
        aliasClaimsExistingName.push({ key: row.key, alias });
      }
    }
  }

  return { duplicateKeys, keyMatchesExistingProfile, keyShadowedByAlias, aliasClaimsExistingName };
}

/* -------------------------------------------------------------------------- merging */

const PATCHED_FIELDS = ["displayName", "aliases", "bio", "role", "links"];

/**
 * Fold a planned row into the row that is already stored.
 *
 * `bulkImport` patches every field it is handed, so an import row that omits
 * something clears it. The merge therefore treats the stored row as the
 * authority for everything a human may have touched — bio, display name, links
 * and title — and contributes only what the corpus knows: additional aliases,
 * and defaults for fields that are still empty.
 *
 * This is also what makes a second run a no-op.
 */
export function mergeWithStoredProfile(planned, stored) {
  if (!stored) {
    return { entry: { ...planned }, action: "create", changedFields: PATCHED_FIELDS };
  }

  const aliases = Array.from(
    new Set([...(stored.aliases ?? []).map(normalizeName), ...planned.aliases.map(normalizeName)]),
  ).filter(Boolean);

  // A stored value always wins. The corpus only supplies a default for a field
  // nobody has filled in, so no rerun can walk back an editor's decision.
  const role = stored.role || planned.role;

  const entry = {
    key: normalizeKey(stored.key),
    displayName: stored.displayName || planned.displayName,
    aliases,
    bio: stored.bio ? stored.bio : planned.bio,
    ...(role ? { role } : {}),
    links: (stored.links ?? []).length > 0 ? stored.links : planned.links,
    ...(stored.avatarStorageId ? { avatarStorageId: stored.avatarStorageId } : {}),
    ...(stored.avatarUrl ? { avatarUrl: stored.avatarUrl } : {}),
    ...(stored.membershipEmail ? { membershipEmail: stored.membershipEmail } : {}),
    ...(stored.createdAt ? { createdAt: stored.createdAt } : {}),
  };

  const changedFields = PATCHED_FIELDS.filter((field) => {
    const before = JSON.stringify(stored[field] ?? null);
    const after = JSON.stringify(entry[field] ?? null);
    return before !== after;
  });

  return { entry, action: changedFields.length > 0 ? "update" : "unchanged", changedFields };
}

/**
 * The full write list: alias additions first (so the biggest artist in the
 * corpus is whole before anything else is judged against it), then new rows.
 */
export function buildImportEntries(plan, storedByKey = new Map()) {
  const entries = [];

  for (const addition of plan.aliasAdditions) {
    const stored = storedByKey.get(addition.key);
    if (!stored) {
      continue;
    }

    const planned = {
      key: addition.key,
      displayName: stored.displayName,
      aliases: addition.aliases,
      bio: stored.bio ?? "",
      links: stored.links ?? [],
      ...(stored.role ? { role: stored.role } : {}),
    };

    entries.push({ ...mergeWithStoredProfile(planned, stored), reason: "alias addition" });
  }

  for (const row of plan.created) {
    const {
      key,
      explicitKey: _explicitKey,
      droppedCharacters: _droppedCharacters,
      sources: _sources,
      notableThirdParty: _notableThirdParty,
      ...planned
    } = row;
    entries.push({
      ...mergeWithStoredProfile({ key, ...planned }, storedByKey.get(key)),
      reason: "credited identity",
    });
  }

  return entries;
}

/* ------------------------------------------------------------------- roster preview */

/** Mirrors `EFFECT_INDEX_FOUNDER_KEY` in src/data/contributorRoster.ts. */
export const ROSTER_FOUNDER_KEY = "JOSIE";

/** Mirrors `EFFECT_INDEX_EXCLUDED_CONTRIBUTOR_KEYS`. */
export const ROSTER_EXCLUDED_KEYS = Object.freeze(["LYREA"]);

/**
 * Count the distinct pages that credit each profile.
 *
 * A deliberate re-implementation of `countContributorPageReferences` from
 * `src/data/contributorRoster.ts`, because this script is ESM JavaScript and
 * that module is TypeScript inside the app graph. It is a preview, not a write
 * input: if the two ever drift, the ordering shown here is wrong and nothing
 * stored is. The rule it mirrors — one page counts once for a contributor,
 * however many times that page names them — is stated in that module's header.
 */
export function countPageReferences(profiles, { effects = [], replications = [], reports = [] } = {}) {
  const pages = new Map();
  const add = (id, name) => {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!pages.has(id)) {
      pages.set(id, new Set());
    }
    if (trimmed) {
      pages.get(id).add(trimmed);
    }
  };

  for (const effect of effects) {
    const id = `effect:${effect.slug}`;
    add(id, "");
    for (const contributor of effect.contributors ?? []) {
      add(id, contributor);
    }
    for (const audio of effect.audio_replications ?? []) {
      add(id, audio?.artist);
    }
  }

  for (const replication of replications) {
    add(`effect:${replication.effect_slug}`, replication.artist);
  }

  for (const report of reports) {
    add(`report:${report.slug}`, report?.subject?.name);
  }

  const byName = new Map();
  for (const profile of profiles) {
    for (const name of matchNamesOf(profile)) {
      byName.set(name, normalizeKey(profile.key));
    }
  }

  const counts = new Map(profiles.map((profile) => [normalizeKey(profile.key), 0]));
  for (const names of pages.values()) {
    const credited = new Set();
    for (const name of names) {
      const key = byName.get(normalizeName(name));
      if (key) {
        credited.add(key);
      }
    }
    for (const key of credited) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

/** The roster as the About page would render it: founder pinned, then by count. */
export function buildRosterPreview(profiles, counts) {
  const excluded = new Set(ROSTER_EXCLUDED_KEYS.map(normalizeKey));
  const entries = profiles
    .map((profile) => ({
      key: normalizeKey(profile.key),
      displayName: profile.displayName,
      referenceCount: counts.get(normalizeKey(profile.key)) ?? 0,
    }))
    .filter((entry) => !excluded.has(entry.key));

  const founder = entries.find((entry) => entry.key === ROSTER_FOUNDER_KEY) ?? null;
  const rest = entries
    .filter((entry) => entry !== founder)
    .sort(
      (left, right) =>
        right.referenceCount - left.referenceCount ||
        left.displayName.localeCompare(right.displayName) ||
        left.key.localeCompare(right.key),
    );

  return founder ? [founder, ...rest] : rest;
}

/**
 * What the published contributor roster becomes.
 *
 * This is the part of the run that most needs a human's eye: the import does not
 * quietly add pages, it adds names to a page the site presents as "everyone who
 * has contributed to the archive". So the plan states the before, the after, and
 * every name that is new — in roster order, so the owner can see where each one
 * lands.
 */
export function previewRosterImpact({ profiles = [], plan, effects = [], replications = [], reports = [] }) {
  const aliasesByKey = new Map(
    plan.aliasAdditions.map((addition) => [addition.key, addition.aliases]),
  );

  const beforeProfiles = profiles.map((profile) => ({
    key: normalizeKey(profile.key),
    displayName: profile.displayName,
    aliases: profile.aliases ?? [],
  }));

  const afterProfiles = [
    ...beforeProfiles.map((profile) => ({
      ...profile,
      aliases: Array.from(new Set([...profile.aliases, ...(aliasesByKey.get(profile.key) ?? [])])),
    })),
    ...plan.created.map((row) => ({
      key: row.key,
      displayName: row.displayName,
      aliases: row.aliases,
    })),
  ];

  const source = { effects, replications, reports };
  const before = buildRosterPreview(beforeProfiles, countPageReferences(beforeProfiles, source));
  const after = buildRosterPreview(afterProfiles, countPageReferences(afterProfiles, source));

  const beforeKeys = new Set(before.map((entry) => entry.key));
  const notable = new Set(
    plan.created.filter((row) => row.notableThirdParty).map((row) => row.key),
  );

  return {
    before,
    after,
    added: after
      .map((entry, index) => ({ ...entry, position: index + 1, notableThirdParty: notable.has(entry.key) }))
      .filter((entry) => !beforeKeys.has(entry.key)),
    movedByAlias: after
      .filter((entry) => beforeKeys.has(entry.key))
      .map((entry) => ({
        ...entry,
        wasReferenceCount: before.find((row) => row.key === entry.key)?.referenceCount ?? 0,
      }))
      .filter((entry) => entry.referenceCount !== entry.wasReferenceCount),
  };
}

/* ---------------------------------------------------------------------------- report */

function printPlan(plan, entries, roster) {
  const creates = entries.filter((entry) => entry.action === "create");
  const updates = entries.filter((entry) => entry.action === "update");
  const unchanged = entries.filter((entry) => entry.action === "unchanged");

  console.log("\n" + "#".repeat(78));
  console.log("# NAME CORRECTIONS — the highest-stakes item. Read this first.");
  console.log("#".repeat(78));
  console.log(
    "\n  These stored spellings are wrong. Each was established from the artist's own\n" +
      "  published property, and in two cases from this repo's own source filenames.\n" +
      "  The profile below is created under the corrected name and answers to both\n" +
      "  spellings, so it matches the corpus before and after the rows are fixed.\n",
  );
  for (const entry of plan.nameCorrectionsApplied) {
    console.log(
      `  ${entry.storedAs}  ->  ${entry.correctedTo}      key ${entry.key}   ` +
        `${entry.works}w/${entry.reports}r`,
    );
    console.log(`    aliases: ${entry.aliases.map((alias) => `"${alias}"`).join(", ")}`);
    console.log(`    ${entry.evidence}`);
    if (entry.correctsReplicationArtistField) {
      console.log(
        "    ALSO ON THE ROWS: replications.artist still says the wrong spelling. This script\n" +
          "    does not touch it. Run scripts/replications/plan-artist-name-corrections.mjs.",
      );
    }
    console.log("");
  }
  if (plan.nameCorrectionsApplied.length === 0) {
    console.log("  (none)\n");
  }

  console.log("\n" + "#".repeat(78));
  console.log("# ROSTER IMPACT — what the public About page becomes.");
  console.log("#".repeat(78));
  console.log(
    `\n  Effect Index contributor roster: ${roster.before.length} names  ->  ${roster.after.length} names` +
      `   (+${roster.added.length})`,
  );
  console.log(
    "  Everyone the import creates appears there, on the same terms as anyone else, under\n" +
      '  the heading "Everyone who has contributed to the archive". That includes the\n' +
      "  third parties whose work the gallery reproduces — they are marked below.\n" +
      "  To veto: narrow `isRosterMember` in src/data/contributorRoster.ts. One function.",
  );

  console.log(`\n  ROSTER TODAY (${roster.before.length}):`);
  for (const [index, entry] of roster.before.entries()) {
    console.log(
      `    ${String(index + 1).padStart(3)}. ${entry.displayName.padEnd(26)} ${entry.referenceCount} page(s)`,
    );
  }

  console.log(`\n  NEWLY ON THE ROSTER (${roster.added.length}), with the position each would take:`);
  for (const entry of roster.added) {
    const flag = entry.notableThirdParty ? "   <-- third party, reproduced work" : "";
    console.log(
      `    ${String(entry.position).padStart(3)}. ${entry.displayName.padEnd(26)} ${entry.referenceCount} page(s)${flag}`,
    );
  }

  if (roster.movedByAlias.length > 0) {
    console.log("\n  EXISTING NAMES WHOSE CREDIT COUNT CHANGES (the alias merges):");
    for (const entry of roster.movedByAlias) {
      console.log(
        `    ${entry.displayName.padEnd(26)} ${entry.wasReferenceCount} -> ${entry.referenceCount} page(s)` +
          `   (now ranked #${roster.after.findIndex((row) => row.key === entry.key) + 1})`,
      );
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`  credited identities needing a profile : ${plan.created.length}`);
  console.log(`  alias additions to existing profiles  : ${plan.aliasAdditions.length}`);
  console.log(`  absence markers left alone            : ${plan.absenceMarkers.length}`);
  console.log(
    `  names already resolving to a profile  : ${plan.alreadyResolved.length}` +
      ` (${plan.alreadyResolved.map((entry) => `${entry.displayName}->${entry.key}`).join(", ")})`,
  );
  console.log(`\n  writes: ${creates.length} create, ${updates.length} update, ${unchanged.length} already correct`);

  console.log("\n=== ALIAS ADDITIONS ===");
  for (const addition of plan.aliasAdditions) {
    const status = addition.alreadyPresent ? "already present" : `adding ${addition.missing.map((a) => `"${a}"`).join(", ")}`;
    console.log(`\n  ${addition.key} (${addition.displayName}) — ${status}`);
    console.log(`    claims ${addition.claims.replications} replication(s), ${addition.claims.reports} report(s)`);
    console.log(`    ${addition.evidence}`);
  }
  for (const warning of plan.aliasWarnings) {
    console.warn(`  WARNING ${warning}`);
  }

  console.log("\n=== NEW PROFILES — one shape, one set of defaults, everybody ===");
  for (const row of plan.created) {
    const flags = [
      row.explicitKey ? "EXPLICIT KEY" : null,
      row.role ? `role="${row.role}"` : null,
      row.links.length > 0 ? `${row.links.length} link(s)` : null,
      row.notableThirdParty ? "third party" : null,
    ].filter(Boolean);
    console.log(
      `  ${row.key.padEnd(22)} "${row.displayName}"  ${row.sources.replications}w/${row.sources.reports}r` +
        (flags.length > 0 ? `  ${flags.join(", ")}` : ""),
    );
  }

  console.log("\n=== LINKS: ADDED, REMOVED, UPGRADED, DROPPED, TRUNCATED ===");
  if (plan.linkNotes.length === 0) {
    console.log("  (none)");
  }
  for (const note of plan.linkNotes) {
    const heading =
      note.storedAs && note.storedAs !== note.displayName
        ? `${note.displayName}   (stored as "${note.storedAs}")`
        : note.displayName;
    console.log(`\n  ${heading}`);
    for (const item of note.added) {
      console.log(`    ADDED    ${item.url}   [${item.verification}]`);
      console.log(`             ${item.evidence}`);
    }
    for (const item of note.removed) {
      console.log(`    REMOVED  ${JSON.stringify(item.url)} (x${item.count}) — ${item.reason}`);
    }
    for (const item of note.upgraded) {
      console.log(`    UPGRADED http -> https  ${item.from}`);
      console.log(`                            evidence: ${item.evidence}`);
    }
    for (const item of note.dropped) {
      console.log(`    DROPPED  ${JSON.stringify(item.url)} (x${item.count}) — ${item.reason}`);
      if (item.suggestedRepair) {
        console.log(`             suggested repair, needs approval: ${item.suggestedRepair}`);
      }
    }
    for (const item of note.truncated) {
      console.log(`    TRUNCATED (over the ${MAX_PROFILE_LINKS}-link cap): ${item.url}`);
    }
  }

  const waybackOnly = plan.linkNotes.flatMap((note) =>
    note.added
      .filter((item) => item.verification === "wayback-only")
      .map((item) => ({ displayName: note.displayName, url: item.url })),
  );
  console.log("\n=== LINKS APPLIED ON ARCHIVE EVIDENCE, NOT A LIVE CHECK ===");
  console.log(
    "  Reddit blocks the researching network end to end, so no reddit.com URL below was\n" +
      "  fetched. Existence rests on a Wayback capture and the attribution rests on Effect\n" +
      "  Index's or Josie's own published pairing. Treat as unverified for liveness.",
  );
  if (waybackOnly.length === 0) {
    console.log("  (none)");
  }
  for (const item of waybackOnly) {
    console.log(`  ${item.displayName.padEnd(22)} ${item.url}`);
  }

  console.log("\n" + "#".repeat(78));
  console.log("# LEFT TO THE OWNER — nothing below is written by this run.");
  console.log("#".repeat(78));
  for (const decision of plan.ownerDecisions) {
    console.log(`\n  ${decision.subject}  [${decision.strength}]`);
    console.log(`    Q: ${decision.question}`);
    for (const candidate of decision.candidates ?? []) {
      console.log(`    - ${candidate.url ?? "(no link at all)"}`);
      if (candidate.note) {
        console.log(`      ${candidate.note}`);
      }
    }
    console.log(`    Why not applied: ${decision.whyNotApplied}`);
  }
  for (const entry of plan.inertNameCorrections) {
    console.log(`\n  NAME (inert, ${entry.strength}) ${entry.stored} -> ${entry.correct}`);
    console.log(`    ${entry.evidence}`);
  }
  for (const entry of plan.inertLinkCorrections) {
    console.log(`\n  LINKS (inert, ${entry.strength}) ${entry.artist}`);
  }

  if (plan.checkedAndFoundWrong.length > 0) {
    console.log("\n=== RESEARCH CLAIMS CHECKED AND FOUND WRONG ===");
    for (const entry of plan.checkedAndFoundWrong) {
      console.log(`\n  CLAIM   ${entry.claim}`);
      console.log(`  FINDING ${entry.finding}`);
    }
  }

  console.log("\n=== ABSENCE MARKERS — NO PROFILE CREATED ===");
  for (const marker of plan.absenceMarkers) {
    console.log(`  "${marker.displayName}"  ${marker.replications} replication(s), ${marker.reports} report(s)`);
  }

  const collisions = plan.collisions;
  const collisionCount =
    collisions.duplicateKeys.length +
    collisions.keyMatchesExistingProfile.length +
    collisions.keyShadowedByAlias.length +
    collisions.aliasClaimsExistingName.length;

  console.log("\n=== COLLISION CHECKS ===");
  console.log(`  duplicate proposed keys            : ${collisions.duplicateKeys.length} ${collisions.duplicateKeys.join(", ")}`);
  console.log(`  proposed key already a profile     : ${collisions.keyMatchesExistingProfile.length} ${collisions.keyMatchesExistingProfile.join(", ")}`);
  console.log(`  proposed key shadowed by an alias  : ${collisions.keyShadowedByAlias.length} ${collisions.keyShadowedByAlias.join(", ")}`);
  console.log(`  proposed alias claims a taken name : ${collisions.aliasClaimsExistingName.length}`);

  console.log("\n=== CORRECTIONS FILE CHECKS ===");
  console.log(`  blocked URL reached a planned link : ${plan.blockedLinks.length}`);
  for (const item of plan.blockedLinks) {
    console.error(`    BLOCKED ${item.displayName}: ${item.url} — ${item.reason}`);
  }
  console.log(`  corrections matching no credit     : ${plan.unmatchedCorrections.length}`);
  for (const item of plan.unmatchedCorrections) {
    console.warn(`    UNMATCHED ${item.kind} for "${item.name}" — nothing in the corpus is credited to it.`);
  }

  if (plan.possibleMerges.length > 0) {
    console.log("\n=== FOR INFORMATION: POSSIBLE DUPLICATES ===");
    console.log("  Given their own profile, like everyone else. renameKey folds one into another");
    console.log("  later if the owner confirms; an alias applied on a hunch would instead credit");
    console.log("  one person's work to another, which is the harder mistake to notice.");
    for (const merge of plan.possibleMerges) {
      console.log(`\n  ${merge.key} "${merge.displayName}"  -> possibly ${merge.candidateKey}`);
      console.log(`    ${merge.evidence}`);
    }
  }

  return { creates, updates, unchanged, collisionCount, blockedCount: plan.blockedLinks.length };
}

/* ------------------------------------------------------------------------------ main */

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  // Deliberately not falling back to VITE_CONVEX_URL: that variable points at
  // the dev deployment, and a plan built from dev data would describe writes to
  // production that were never checked against production.
  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;

  if (!readUrl) {
    throw new Error(
      "Set TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL) so the script knows which deployment to read.",
    );
  }

  const client = new ConvexHttpClient(readUrl);
  // `subjectiveEffects` is read only for the roster preview: its `contributors[]`
  // and `audio_replications[].artist` are credit sources the About page counts,
  // so leaving them out would understate where each new name ranks.
  const [replications, reports, profiles, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.tripReports.getAll, {}),
    client.query(api.contributorProfiles.getAll, {}),
    client.query(api.subjectiveEffects.getAll, {}),
  ]);

  console.log(
    `\nRead ${replications.length} replications, ${reports.length} trip reports, ` +
      `${profiles.length} profiles, ${effects.length} effects.`,
  );

  const plan = buildSeedPlan({ replications, reports, profiles });
  const storedByKey = new Map(profiles.map((profile) => [normalizeKey(profile.key), profile]));
  const entries = buildImportEntries(plan, storedByKey);
  const roster = previewRosterImpact({ profiles, plan, effects, replications, reports });
  const { creates, updates, collisionCount, blockedCount } = printPlan(plan, entries, roster);

  if (collisionCount > 0) {
    throw new Error(`${collisionCount} identity collision(s) — resolve them before writing.`);
  }

  // Fails the dry run too. A blocked URL in the plan means the corrections file
  // and the link planner disagree about what may be published, and that is not
  // a thing to discover by reading past it.
  if (blockedCount > 0) {
    throw new Error(
      `${blockedCount} planned link(s) are on the blocked list — a trap or a dead host would be published.`,
    );
  }

  if (command.dryRun) {
    console.log(
      "\nDry run — no Convex writes performed. The write path re-reads the raw profile rows " +
        "through getForBulkImport and merges against those, so avatars, membership emails and " +
        "createdAt survive the patch.",
    );
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("profileMediaWrite");
  const writeClient = new ConvexHttpClient(command.targetUrl);

  // The public read materializes rows, which loses avatarStorageId, membershipEmail
  // and createdAt — all of which bulkImport would then clear. Re-plan the merge
  // against the raw rows before writing anything.
  const rawProfiles = await writeClient.query(api.contributorProfiles.getForBulkImport, {
    apiKey,
    keys: entries.map((entry) => entry.entry.key),
  });
  const rawByKey = new Map(rawProfiles.map((profile) => [normalizeKey(profile.key), profile]));
  const finalEntries = buildImportEntries(plan, rawByKey).filter(
    (entry) => entry.action !== "unchanged",
  );

  console.log(`\nWriting ${finalEntries.length} profile row(s)...`);
  const result = await writeClient.mutation(api.contributorProfiles.bulkImport, {
    apiKey,
    profiles: finalEntries.map((entry) => entry.entry),
  });

  console.log(`Created ${result.created}, updated ${result.updated}.`);
  console.log(`(planned: ${creates.length} create, ${updates.length} update)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
