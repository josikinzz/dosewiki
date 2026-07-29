/**
 * Effect Index URLs retained for inbound links.
 *
 * Extracted from `next.config.ts` so application code can read the table without
 * importing the Next config (which would pull the config loader's dependency graph into
 * the bundle). `next.config.ts` imports this module and is still the only place that
 * turns these into redirect rules; the ordering and shape below are asserted by
 * `effectIndexRedirects.test.ts` through `nextConfig.redirects()`.
 *
 * Deliberately dependency-free and client-safe: the Discord page renders the invite from
 * {@link EFFECT_INDEX_DISCORD_INVITE_URL} rather than writing the URL out a second time,
 * so `/discord-chat` and `/discord` can never drift apart.
 *
 * Effect Index's subarticle selector (`?s=<id>`) maps to `#<id>` because subarticle
 * sections render with the same ids as their anchors.
 */
export const effectIndexLegacyRedirects = [
  { source: "/effects/external-hallucinations", destination: "/effects/external-hallucination" },
  { source: "/effects/internal-hallucinations", destination: "/effects/internal-hallucination" },
  { source: "/substances/dxm", destination: "/articles/dxm" },
  { source: "/effects/psychedelic-therapy", destination: "/articles/psychedelic-therapy" },
  { source: "/effects/autonomous-entities", destination: "/effects/autonomous-entity" },
  {
    source: "/effects/psychedlic-intensity-scale",
    destination: "/articles/psychedelic-intensity-scale",
  },
  { source: "/effects/time-reversal", destination: "/effects/time-distortion#time-reversal" },
  { source: "/substances/dmt", destination: "/articles/dmt" },
  { source: "/subjectivereport", destination: "https://subjective.report" },
  {
    source: "/effects/duration-terminology-explanation",
    destination: "/articles/duration-terminology-explanation",
  },
  { source: "/effects/time-dilation", destination: "/effects/time-distortion#time-dilation" },
  {
    source: "/effects/approximate-frequency-of-occurrence-scale",
    destination: "/articles/approximate-frequency-of-occurrence-scale",
  },
  { source: "/effects/time-compression", destination: "/effects/time-distortion#time-compression" },
  { source: "/effects/atemporality", destination: "/effects/time-distortion#atemporality" },
  // NOTE: this invite is EXPIRED upstream (`GET /api/v10/invites/VSm5bF7` →
  // `{"message":"Invite is expired."}`). It is kept because the legacy `/discord-chat`
  // redirect has always pointed here and the old site's prose links to it verbatim, but
  // nothing on the new site leads with it as a call to action until a guild admin mints a
  // non-expiring replacement for guild 543908157165142037. Replace this single string and
  // every surface follows.
  { source: "/discord-chat", destination: "https://discord.gg/VSm5bF7" },
] as const;

const DISCORD_INVITE_REDIRECT_SOURCE = "/discord-chat";

function resolveDiscordInviteUrl(): string {
  const entry = effectIndexLegacyRedirects.find(
    (redirect) => redirect.source === DISCORD_INVITE_REDIRECT_SOURCE,
  );

  if (!entry) {
    // Fail loudly rather than rendering a Discord page with a dead join link.
    throw new Error(
      `effectIndexLegacyRedirects is missing the ${DISCORD_INVITE_REDIRECT_SOURCE} entry that owns the Discord invite URL.`,
    );
  }

  return entry.destination;
}

/**
 * The single source of truth for the Effect Index Discord invite: the destination of the
 * legacy `/discord-chat` redirect.
 */
export const EFFECT_INDEX_DISCORD_INVITE_URL = resolveDiscordInviteUrl();
