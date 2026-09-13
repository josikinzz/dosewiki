import { describe, expect, it } from "vitest";
import type { ReplicationWithUrl } from "@/types/replications";
import {
  audioReplicationFromRow,
  collectAudioReplications,
  countAudioReplicationArtists,
} from "./audioReplicationIndex";

const audio = (title: string, artist = "Hyperactive_Filly", resource = `/audio/${title}.mp3`) => ({
  title,
  artist,
  resource,
});

const storedRow = (overrides: Partial<ReplicationWithUrl> = {}): ReplicationWithUrl =>
  ({
    _id: "rep-1",
    _creationTime: 0,
    slug: "a-recording",
    title: "A recording",
    artist: "Hyperactive_Filly",
    type: "audio",
    format: "mp3",
    effect_slug: "auditory-hallucination",
    created_at: "2026-01-01T00:00:00.000Z",
    url: "https://cdn.test/a-recording.mp3",
    ...overrides,
  }) as ReplicationWithUrl;

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

  it("lists a stored audio replication row beside the inline clips", () => {
    const entries = collectAudioReplications(
      [
        {
          slug: "auditory-hallucination",
          name: "Auditory hallucination",
          audio_replications: [audio("Sinister voices")],
        },
      ],
      [storedRow()],
    );

    expect(entries.map((entry) => entry.audio.title)).toEqual([
      "A recording",
      "Sinister voices",
    ]);
    expect(entries[0]).toMatchObject({
      effectSlug: "auditory-hallucination",
      effectName: "Auditory hallucination",
      audio: { resource: "https://cdn.test/a-recording.mp3" },
    });
  });

  it("prefers the stored row over the inline copy of the same clip", () => {
    // A migrated clip would otherwise appear twice: once from `public/audio/`
    // and once from the row that now carries its rights metadata.
    const entries = collectAudioReplications(
      [
        {
          slug: "auditory-hallucination",
          name: "Auditory hallucination",
          audio_replications: [audio("A Recording")],
        },
      ],
      [storedRow()],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].audio.resource).toBe("https://cdn.test/a-recording.mp3");
  });

  it("leaves out a stored row with no owning effect or no resolved media", () => {
    expect(
      collectAudioReplications([], [
        storedRow({ slug: "unattached", effect_slug: "unknown" }),
        storedRow({ slug: "no-effect", effect_slug: undefined }),
        storedRow({ slug: "no-media", url: "  " }),
      ]),
    ).toEqual([]);
  });

  it("names an effect the article read did not carry from its slug", () => {
    const [entry] = collectAudioReplications([], [storedRow()]);

    expect(entry.effectName).toBe("auditory hallucination");
  });
});

describe("audioReplicationFromRow", () => {
  it("carries the rights fields across and drops everything with no reader", () => {
    const projected = audioReplicationFromRow(
      storedRow({
        rights_status: "permission-granted",
        license_name: "CC BY 4.0",
        credit_line: "A recording by Hyperactive_Filly.",
        storage_id: "private-storage",
      }),
    );

    expect(projected).toEqual({
      title: "A recording",
      artist: "Hyperactive_Filly",
      resource: "https://cdn.test/a-recording.mp3",
      rights_status: "permission-granted",
      license_name: "CC BY 4.0",
      credit_line: "A recording by Hyperactive_Filly.",
    });
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
