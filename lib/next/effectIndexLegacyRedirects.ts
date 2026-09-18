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

  // Wrong link targets authored into the Effect Index article bodies themselves,
  // rather than URLs the old site ever served. Each one 404s as written, and the
  // slug is wrong in a way no general rewrite can infer, so the correction lives
  // here. Structural slips — a doubled `/effects/effects/` prefix, a `?s=`
  // selector that should be a fragment — are fixed in `IntLink` instead, because
  // those are patterns rather than one-offs.
  //
  // The underlying article bodies in Postgres still carry the wrong hrefs; see the
  // 2026-07-29 handoff for the data-side pass that would retire these entries.
  { source: "/effects/acuity-suppression", destination: "/effects/visual-acuity-suppression" },
  {
    source: "/effects/perceived-exposure-to-inner-mechanics-of-consciousness",
    destination: "/effects/visual-exposure-to-inner-mechanics-of-consciousness",
  },
  { source: "/effects/dreams", destination: "/articles/dreams" },
  // Companion to the misspelled `/effects/psychedlic-intensity-scale` above: the
  // dissociative scale links the correctly spelled slug, still under /effects.
  {
    source: "/effects/psychedelic-intensity-scale",
    destination: "/articles/psychedelic-intensity-scale",
  },
  // Missing `/effects` prefix entirely. Safe as root-level sources: no substance
  // article claims either slug, so neither shadows a real `/[slug]` route.
  { source: "/auditory-distortion", destination: "/effects/auditory-distortion" },
  { source: "/visual-acuity-enhancement", destination: "/effects/visual-acuity-enhancement" },

  // Bare relative `[int-link to="anxiety"]` targets authored into the effect
  // article bodies. `normalizeInternalPath` prefixes the missing slash, which
  // lands them on `/<slug>` — the substance route — where they 404. Every slug
  // below was checked against the live tables: each is a real effect and none is
  // claimed by a substance article, so none shadows a `/[slug]` page.
  { source: "/anxiety", destination: "/effects/anxiety" },
  { source: "/autonomous-entity", destination: "/effects/autonomous-entity" },
  {
    source: "/autonomous-voice-communication",
    destination: "/effects/autonomous-voice-communication",
  },
  { source: "/delirium", destination: "/effects/delirium" },
  { source: "/delusion", destination: "/effects/delusion" },
  { source: "/depression", destination: "/effects/depression" },
  { source: "/double-vision", destination: "/effects/double-vision" },
  { source: "/external-hallucination", destination: "/effects/external-hallucination" },
  { source: "/feelings-of-impending-doom", destination: "/effects/feelings-of-impending-doom" },
  { source: "/internal-hallucination", destination: "/effects/internal-hallucination" },
  { source: "/paranoia", destination: "/effects/paranoia" },
  { source: "/thought-deceleration", destination: "/effects/thought-deceleration" },
  // Bare *and* wrong: the misspelled slug corrected above, without its prefix.
  { source: "/acuity-suppression", destination: "/effects/visual-acuity-suppression" },

  // EDITORIAL INFERENCE — these two name effects that have never existed under
  // any slug, so the target is a judgement call, not a lookup. Both are the
  // nearest surviving effect by name and by the company they keep in the list
  // they appear in. A redirect beats the 404 they are today, but if either is
  // wrong the fix is to correct it here (and in the article body), not to add
  // another hop.
  //   "Emotion enhancement", listed among cognitive enhancements.
  { source: "/effects/emotion-enhancement", destination: "/effects/emotion-intensification" },
  //   "Spontaneous bodily sensations" — PsychonautWiki's name for the effect
  //   Effect Index documents as spontaneous tactile sensations.
  {
    source: "/effects/spontaneous-bodily-sensations",
    destination: "/effects/spontaneous-tactile-sensations",
  },
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
