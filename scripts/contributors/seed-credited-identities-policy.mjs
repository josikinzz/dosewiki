// Pure identity normalization and URL publication policy.
import {
  ABSENCE_MARKERS,
  EXPLICIT_PROFILE_KEYS,
  HTTPS_UNAVAILABLE_HOSTS,
  HTTPS_VERIFIED_HOSTS,
  MAX_PROFILE_LINKS,
} from "./seed-credited-identities-decisions.mjs";

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
