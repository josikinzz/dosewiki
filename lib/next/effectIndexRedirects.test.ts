import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

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
      { source: "/effects/external-hallucinations", destination: "/effects/external-hallucination", permanent: true },
      { source: "/effects/internal-hallucinations", destination: "/effects/internal-hallucination", permanent: true },
      { source: "/substances/dxm", destination: "/articles/dxm", permanent: true },
      { source: "/effects/psychedelic-therapy", destination: "/articles/psychedelic-therapy", permanent: true },
      { source: "/effects/autonomous-entities", destination: "/effects/autonomous-entity", permanent: true },
      { source: "/effects/psychedlic-intensity-scale", destination: "/articles/psychedelic-intensity-scale", permanent: true },
      { source: "/effects/time-reversal", destination: "/effects/time-distortion#time-reversal", permanent: true },
      { source: "/substances/dmt", destination: "/articles/dmt", permanent: true },
      { source: "/subjectivereport", destination: "https://subjective.report", permanent: true },
      { source: "/effects/duration-terminology-explanation", destination: "/articles/duration-terminology-explanation", permanent: true },
      { source: "/effects/time-dilation", destination: "/effects/time-distortion#time-dilation", permanent: true },
      { source: "/effects/approximate-frequency-of-occurrence-scale", destination: "/articles/approximate-frequency-of-occurrence-scale", permanent: true },
      { source: "/effects/time-compression", destination: "/effects/time-distortion#time-compression", permanent: true },
      { source: "/effects/atemporality", destination: "/effects/time-distortion#atemporality", permanent: true },
      { source: "/discord-chat", destination: "https://discord.gg/VSm5bF7", permanent: true },
    ]);
  });
});
