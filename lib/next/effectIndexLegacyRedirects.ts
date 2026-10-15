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
  { source: "/discord-chat", destination: "https://discord.gg/VSm5bF7" },

  { source: "/effects/acuity-suppression", destination: "/effects/visual-acuity-suppression" },
  {
    source: "/effects/perceived-exposure-to-inner-mechanics-of-consciousness",
    destination: "/effects/visual-exposure-to-inner-mechanics-of-consciousness",
  },
  { source: "/effects/dreams", destination: "/articles/dreams" },
  {
    source: "/effects/psychedelic-intensity-scale",
    destination: "/articles/psychedelic-intensity-scale",
  },
  { source: "/auditory-distortion", destination: "/effects/auditory-distortion" },
  { source: "/visual-acuity-enhancement", destination: "/effects/visual-acuity-enhancement" },

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
  { source: "/acuity-suppression", destination: "/effects/visual-acuity-suppression" },

  { source: "/effects/emotion-enhancement", destination: "/effects/emotion-intensification" },
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
    throw new Error(
      `effectIndexLegacyRedirects is missing the ${DISCORD_INVITE_REDIRECT_SOURCE} entry that owns the Discord invite URL.`,
    );
  }

  return entry.destination;
}

export const EFFECT_INDEX_DISCORD_INVITE_URL = resolveDiscordInviteUrl();
