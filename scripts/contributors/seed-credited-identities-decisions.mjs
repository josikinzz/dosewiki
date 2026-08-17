// Reviewed identity and link decisions used by the credited-identity import.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
export const MAX_PROFILE_LINKS = 3;

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

export const NOTABLE_THIRD_PARTY_NAMES = new Set(
  NOTABLE_THIRD_PARTIES.map((name) => name.toLowerCase()),
);

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
