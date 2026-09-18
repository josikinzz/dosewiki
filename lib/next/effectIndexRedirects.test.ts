import { beforeAll, describe, expect, it } from "vitest";
import type { NextConfig } from "next";
import configureNext from "../../next.config";
import {
  EFFECT_INDEX_DISCORD_INVITE_URL,
  effectIndexLegacyRedirects,
} from "./effectIndexLegacyRedirects";

let nextConfig: NextConfig;
beforeAll(async () => {
  nextConfig = await configureNext();
});

describe("Effect Index legacy redirects", () => {
  it("preserves every imported Effect Index redirect, including subarticle selectors", async () => {
    const redirects = await nextConfig.redirects?.();
    const effectIndexRedirects = redirects?.filter((redirect) =>
      [
        "/effects/external-hallucinations",
        "/effects/internal-hallucinations",
        "/substances/dxm",
        "/effects/psychedelic-therapy",
        "/effects/autonomous-entities",
        "/effects/psychedlic-intensity-scale",
        "/effects/time-reversal",
        "/substances/dmt",
        "/subjectivereport",
        "/effects/duration-terminology-explanation",
        "/effects/time-dilation",
        "/effects/approximate-frequency-of-occurrence-scale",
        "/effects/time-compression",
        "/effects/atemporality",
        "/discord-chat",
      ].includes(redirect.source),
    );

    expect(effectIndexRedirects).toEqual([
      {
        source: "/effects/external-hallucinations",
        destination: "/effects/external-hallucination",
        permanent: true,
      },
      {
        source: "/effects/internal-hallucinations",
        destination: "/effects/internal-hallucination",
        permanent: true,
      },
      {
        source: "/substances/dxm",
        destination: "/articles/dxm",
        permanent: true,
      },
      {
        source: "/effects/psychedelic-therapy",
        destination: "/articles/psychedelic-therapy",
        permanent: true,
      },
      {
        source: "/effects/autonomous-entities",
        destination: "/effects/autonomous-entity",
        permanent: true,
      },
      {
        source: "/effects/psychedlic-intensity-scale",
        destination: "/articles/psychedelic-intensity-scale",
        permanent: true,
      },
      {
        source: "/effects/time-reversal",
        destination: "/effects/time-distortion#time-reversal",
        permanent: true,
      },
      {
        source: "/substances/dmt",
        destination: "/articles/dmt",
        permanent: true,
      },
      {
        source: "/subjectivereport",
        destination: "https://subjective.report",
        permanent: true,
      },
      {
        source: "/effects/duration-terminology-explanation",
        destination: "/articles/duration-terminology-explanation",
        permanent: true,
      },
      {
        source: "/effects/time-dilation",
        destination: "/effects/time-distortion#time-dilation",
        permanent: true,
      },
      {
        source: "/effects/approximate-frequency-of-occurrence-scale",
        destination: "/articles/approximate-frequency-of-occurrence-scale",
        permanent: true,
      },
      {
        source: "/effects/time-compression",
        destination: "/effects/time-distortion#time-compression",
        permanent: true,
      },
      {
        source: "/effects/atemporality",
        destination: "/effects/time-distortion#atemporality",
        permanent: true,
      },
      {
        source: "/discord-chat",
        destination: "https://discord.gg/VSm5bF7",
        permanent: true,
      },
    ]);
  });

  it("rescues the wrong link targets authored into the article bodies", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const destinationFor = (source: string) =>
      redirects.find((redirect) => redirect.source === source)?.destination;

    // Slugs that never existed under any spelling.
    expect(destinationFor("/effects/acuity-suppression")).toBe(
      "/effects/visual-acuity-suppression",
    );
    expect(
      destinationFor(
        "/effects/perceived-exposure-to-inner-mechanics-of-consciousness",
      ),
    ).toBe("/effects/visual-exposure-to-inner-mechanics-of-consciousness");
    // An article, linked as though it were an effect.
    expect(destinationFor("/effects/dreams")).toBe("/articles/dreams");
    expect(destinationFor("/effects/psychedelic-intensity-scale")).toBe(
      "/articles/psychedelic-intensity-scale",
    );
    // Missing the `/effects` prefix altogether.
    expect(destinationFor("/auditory-distortion")).toBe(
      "/effects/auditory-distortion",
    );
    expect(destinationFor("/visual-acuity-enhancement")).toBe(
      "/effects/visual-acuity-enhancement",
    );
    // Editorial inferences — see the comment on these entries before changing them.
    expect(destinationFor("/effects/emotion-enhancement")).toBe(
      "/effects/emotion-intensification",
    );
    expect(destinationFor("/effects/spontaneous-bodily-sensations")).toBe(
      "/effects/spontaneous-tactile-sensations",
    );
  });

  it("redirects retired replication playlists before a page can stream", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/replications/effect/:slug",
          destination: "/effects/:slug",
          permanent: true,
        },
        {
          source: "/replications/substance/:slug",
          destination: "/:slug",
          permanent: true,
        },
      ]),
    );
  });

  it("never redirects a source to a destination that is itself redirected", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const sources = new Set(redirects.map((redirect) => redirect.source));

    // A redirect chain costs a second round trip and breaks if the middle hop is
    // ever removed, so every destination must be a real endpoint.
    const chained = redirects
      .filter((redirect) => sources.has(redirect.destination.split(/[?#]/)[0]))
      .map((redirect) => `${redirect.source} -> ${redirect.destination}`);

    expect(chained).toEqual([]);
  });
});

describe("Discord invite URL", () => {
  it("is the destination of the legacy /discord-chat redirect, not a second copy", () => {
    const entry = effectIndexLegacyRedirects.find(
      (redirect) => redirect.source === "/discord-chat",
    );

    expect(entry).toBeDefined();
    expect(EFFECT_INDEX_DISCORD_INVITE_URL).toBe(entry?.destination);
  });

  it("still reaches the Next config's redirect table after the extraction", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: "/discord-chat",
      destination: EFFECT_INDEX_DISCORD_INVITE_URL,
      permanent: true,
    });
  });
});
