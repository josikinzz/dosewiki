import { describe, expect, it } from "vitest";
import {
  collectAudioReplications,
  countAudioReplicationArtists,
} from "./audioReplicationIndex";

const audio = (title: string, artist = "Hyperactive_Filly", resource = `/audio/${title}.mp3`) => ({
  title,
  artist,
  resource,
});

describe("collectAudioReplications", () => {
  it("flattens clips across effects and orders them by effect then title", () => {
    const entries = collectAudioReplications([
      { slug: "auditory-suppression", name: "Auditory suppression", audio_replications: [audio("Watts")] },
      {
        slug: "auditory-hallucination",
        name: "Auditory hallucination",
        audio_replications: [audio("Sinister voices"), audio("DMT Drone")],
      },
      { slug: "geometry", name: "Geometry" },
    ]);

    expect(entries.map((entry) => `${entry.effectSlug}:${entry.audio.title}`)).toEqual([
      "auditory-hallucination:DMT Drone",
      "auditory-hallucination:Sinister voices",
      "auditory-suppression:Watts",
    ]);
  });

  it("drops clips with no playable resource", () => {
    const entries = collectAudioReplications([
      {
        slug: "auditory-hallucination",
        name: "Auditory hallucination",
        audio_replications: [audio("Playable"), audio("Missing", "Emex", "   ")],
      },
    ]);

    expect(entries.map((entry) => entry.audio.title)).toEqual(["Playable"]);
  });

  it("returns nothing when no effect carries audio", () => {
    expect(collectAudioReplications([{ slug: "geometry", name: "Geometry" }])).toEqual([]);
  });
});

describe("countAudioReplicationArtists", () => {
  it("counts distinct creators and ignores unknown ones", () => {
    const entries = collectAudioReplications([
      {
        slug: "auditory-hallucination",
        name: "Auditory hallucination",
        audio_replications: [
          audio("One", "Hyperactive_Filly"),
          audio("Two", "hyperactive_filly"),
          audio("Three", "Emex"),
          audio("Four", "Unknown"),
        ],
      },
    ]);

    expect(countAudioReplicationArtists(entries)).toBe(2);
  });
});
