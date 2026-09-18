export { NO_CORRECTIONS } from "./seed-credited-identities-decisions.mjs";

/**
 * A reviewed corrections file in miniature, with invented artists. The real
 * file describes real people and lives outside the repository; this one covers
 * every list `buildCorrectionIndex` reads and every strength the planner must
 * treat differently.
 */
export const CORRECTIONS = {
  nameCorrections: [
    {
      stored: "Mara Quill",
      correct: "Mara Quillon",
      strength: "strong",
      correctsReplicationArtistField: true,
      evidence: "Her own channel is vimeo.com/maraquillon and every upload is signed Quillon.",
    },
    {
      stored: "TOrvik",
      correct: "Torvik",
      strength: "strong",
      correctsReplicationArtistField: true,
      evidence: "Casing on the artist's own DeviantArt page.",
    },
    {
      stored: "Ines Halloway",
      correct: "Ines Holloway",
      strength: "strong",
      correctsReplicationArtistField: true,
      evidence: "Signature on the original print; no row in the corpus uses this spelling any more.",
    },
    {
      stored: "Pell Drayton",
      correct: "Pel Drayton",
      strength: "weak",
      correctsReplicationArtistField: false,
      evidence: "One forum post spells it with one l; nothing first-party confirms it.",
    },
  ],
  linkCorrections: [
    {
      artist: "Mara Quill",
      strength: "strong",
      add: [
        { url: "https://vimeo.com/maraquillon", evidence: "her own channel", verification: "live-200" },
        { url: "https://www.instagram.com/maraquillonart/", evidence: "linked from the channel", verification: "live-200" },
      ],
      remove: [
        { url: "https://vimeo.com/41806282", reason: "one work, not the artist's home" },
        { url: "https://www.printhouse.example/products/the-lattice-by-mara-quill", reason: "404" },
      ],
    },
    {
      artist: "Sable Rook",
      strength: "strong",
      remove: [
        { url: "http://www.sablerook.example", reason: "NXDOMAIN; was the artist's own site until 2021" },
        { url: "https://www.instagram.com/sablerook/?hl=en", reason: "private and unattributed" },
      ],
    },
    {
      artist: "Tam Vesper",
      strength: "needs-owner",
      add: [{ url: "https://tamvesper.example/", evidence: "same name, no link back", verification: "live-200" }],
    },
  ],
  blockedUrls: [
    { url: "https://maraquillon.example/", reason: "lapsed domain; parking page answers 200" },
  ],
  blockedHosts: [
    { host: "gfycat.com", reason: "shut down 2023; every path 404s" },
  ],
  ownerDecisions: [
    { subject: "Tam Vesper", question: "Is tamvesper.example the credited artist?", decision: null },
  ],
  checkedAndFoundWrong: [
    { artist: "Sable Rook", url: "https://www.instagram.com/sablerook/?hl=en", finding: "private account, no artwork" },
  ],
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
const LYREA = profile("LYREA", "Lyrea", { aliases: ["oldhandle"] });
export const LIVE_PROFILES = [STINGRAYZ, RHO, LYREA];
