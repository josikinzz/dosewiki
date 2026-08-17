import { loadIdentityCorrections } from "./seed-credited-identities.mjs";
/** The reviewed corrections dataset the script actually ships with. */
export const CORRECTIONS = loadIdentityCorrections();

/** Corrections switched off, for the tests that are about the derivation itself. */
export const NO_CORRECTIONS = {
  nameCorrections: [],
  linkCorrections: [],
  blockedUrls: [],
  blockedHosts: [],
  ownerDecisions: [],
  checkedAndFoundWrong: [],
};

/** Shapes and spellings lifted from the live production rows. */
export const replication = (artist, overrides = {}) => ({
  slug: `${artist}-work`,
  effect_slug: "geometry",
  artist,
  ...overrides,
});

export const report = (name) => ({ slug: `${name}-report`, subject: { name } });

export const profile = (key, displayName, overrides = {}) => ({
  key,
  displayName,
  aliases: [],
  bio: "",
  links: [],
  ...overrides,
});

const STINGRAYZ = profile("STINGRAYZ", "StingrayZ", {
  aliases: ["stingrayz"],
  bio: "SOCIAL MEDIA\nfacebook.com/symmetryinvisioned",
});
const RHO = profile("RHO", "Rho", {
  aliases: ["rho"],
  bio: "Instagram - instagram.com/pluralist.visuals",
  role: "Replication Artist",
});
const LYREA = profile("LYREA", "Lyrea", { aliases: ["witchy"] });
export const LIVE_PROFILES = [STINGRAYZ, RHO, LYREA];
