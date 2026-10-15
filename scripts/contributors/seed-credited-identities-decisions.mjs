import fs from "node:fs";

export function loadIdentityCorrections(filePath) {
  if (!filePath) {
    throw new Error("Pass --corrections=<path> pointing at the reviewed identity corrections JSON.");
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export const NO_CORRECTIONS = Object.freeze({
  nameCorrections: [],
  linkCorrections: [],
  blockedUrls: [],
  blockedHosts: [],
  ownerDecisions: [],
  checkedAndFoundWrong: [],
});

export const MAX_PROFILE_LINKS = 3;

export const ABSENCE_MARKERS = Object.freeze([
  "Anonymous",
  "Unknown",
  "midjourney",
  "various artists",
]);

export const NOTABLE_THIRD_PARTIES = Object.freeze([
  "Zdzisław Beksiński",
  "H. R. Giger",
  "David Hockney",
  "Bev Doolittle",
  "Tame Impala",
  "Alex Grey",
]);

export const EXPLICIT_PROFILE_KEYS = Object.freeze({
  "zdzisław beksiński": "ZDZISLAWBEKSINSKI",
});

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
      "LYREA's stored aliases hold only a retired handle; her own name is missing, so she matches " +
      "only through her display name. Recording it makes the two channels agree.",
  },
]);

export const HTTPS_VERIFIED_HOSTS = Object.freeze({
  "en.wikipedia.org": "200",
  "chelseamorganart.co.uk": "200",
  "www.flickr.com": "200",
  "www.wired.co.uk": "301 to https://www.wired.com/...",
  "waruzimu.deviantart.com": "301 to https://www.deviantart.com/moracz/...",
  "artcollider.net": "404 over HTTPS, and the http:// URL 301s to the https:// one",
});

export const HTTPS_UNAVAILABLE_HOSTS = Object.freeze({
  "www.emptykingdom.com": "HTTPS connect timeout; the http:// URL returns 500 — the site is down",
  "www.zensages.com": "NXDOMAIN over both schemes — the domain no longer resolves",
});

export const NOTABLE_THIRD_PARTY_NAMES = new Set(
  NOTABLE_THIRD_PARTIES.map((name) => name.toLowerCase()),
);

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
