import { describe, expect, it } from "vitest";

import {
  PSYCHOACTIVE_SUMMARY_DEFINITIONS,
  getPsychoactiveSummaryDefinition,
} from "./summaryDefinitions";

describe("psychoactive summary definitions", () => {
  it("owns exactly the five curated public paths", () => {
    expect(
      PSYCHOACTIVE_SUMMARY_DEFINITIONS.map((definition) => definition.path),
    ).toEqual([
      "/psychoactive/psychedelic/visual",
      "/psychoactive/psychedelic/cognitive",
      "/psychoactive/psychedelic/miscellaneous",
      "/psychoactive/dissociative",
      "/psychoactive/deliriant",
    ]);
    expect(getPsychoactiveSummaryDefinition(["psychedelic"])).toBeNull();
  });

  it("keeps the Effect Index section order and selection calls", () => {
    expect(
      Object.fromEntries(
        PSYCHOACTIVE_SUMMARY_DEFINITIONS.map((definition) => [
          definition.key,
          definition.sections.map((section) => ({
            title: section.title,
            selection: section.selection,
          })),
        ]),
      ),
    ).toEqual({
      "psychedelic-visual": [
        {
          title: "Visual Amplifications",
          selection: {
            type: "tags",
            tags: ["psychedelic", "visual", "enhancement"],
          },
        },
        {
          title: "Visual Distortions",
          selection: {
            type: "tags",
            tags: ["psychedelic", "visual", "distortion"],
          },
        },
        {
          title: "Geometric Patterns",
          selection: {
            type: "tags",
            tags: ["psychedelic", "visual", "geometric"],
          },
        },
        {
          title: "Hallucinatory States",
          selection: {
            type: "tags",
            tags: ["psychedelic", "visual", "hallucinatory state"],
          },
        },
      ],
      "psychedelic-cognitive": [
        {
          title: "Cognitive Amplifications",
          selection: {
            type: "tags",
            tags: ["psychedelic", "cognitive", "enhancement"],
          },
        },
        {
          title: "Cognitive Suppressions",
          selection: {
            type: "tags",
            tags: ["psychedelic", "cognitive", "suppression"],
          },
        },
        {
          title: "Novel States",
          selection: {
            type: "tags",
            tags: ["psychedelic", "cognitive", "novel"],
          },
        },
        {
          title: "Psychological States",
          selection: {
            type: "tags",
            tags: ["psychedelic", "cognitive", "psychological state"],
          },
        },
        {
          title: "Transpersonal States",
          selection: {
            type: "tags",
            tags: ["psychedelic", "cognitive", "transpersonal state"],
          },
        },
      ],
      "psychedelic-miscellaneous": [
        {
          title: "Auditory Effects",
          selection: {
            type: "tags",
            tags: ["psychedelic", "miscellaneous", "auditory"],
          },
        },
        {
          title: "Tactile Effects",
          selection: {
            type: "tags",
            tags: ["psychedelic", "miscellaneous", "tactile"],
          },
        },
        {
          title: "Multisensory Effects",
          selection: {
            type: "tags",
            tags: ["psychedelic", "miscellaneous", "multisensory"],
          },
        },
        {
          title: "Physical Effects",
          selection: {
            type: "tags",
            tags: ["psychedelic", "miscellaneous", "physical"],
            excludeTags: ["uncomfortable"],
          },
        },
        {
          title: "Uncomfortable Effects",
          selection: {
            type: "tags",
            tags: ["psychedelic", "miscellaneous", "uncomfortable"],
          },
        },
      ],
      dissociative: [
        {
          title: "Disconnective Effects",
          selection: {
            type: "names",
            names: [
              "physical disconnection",
              "cognitive disconnection",
              "visual disconnection",
              "detachment plateaus",
            ],
          },
        },
        {
          title: "Miscellaneous Sensory Effects",
          selection: {
            type: "tags",
            tags: ["dissociative", "sensory"],
            excludeTags: ["disconnective"],
          },
        },
        {
          title: "Cognitive Effects",
          selection: {
            type: "tags",
            tags: ["dissociative", "cognitive"],
            excludeTags: ["disconnective"],
          },
        },
        {
          title: "Physical Effects",
          selection: {
            type: "tags",
            tags: ["dissociative", "physical"],
            excludeTags: ["uncomfortable"],
          },
        },
      ],
      deliriant: [
        {
          title: "Visual Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "visual"],
          },
        },
        {
          title: "Auditory Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "auditory"],
          },
        },
        {
          title: "Tactile Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "tactile"],
          },
        },
        {
          title: "Multisensory Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "multisensory"],
          },
        },
        {
          title: "Cognitive Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "cognitive"],
          },
        },
        {
          title: "Physical Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "physical"],
            excludeTags: ["uncomfortable"],
          },
        },
        {
          title: "Uncomfortable Physical Effects",
          selection: {
            type: "tags",
            tags: ["deliriant", "uncomfortable"],
          },
        },
      ],
    });
  });

  it("bakes the Effect Index gallery images into their final R2 URLs", () => {
    const images = PSYCHOACTIVE_SUMMARY_DEFINITIONS.flatMap((definition) =>
      "image" in definition ? [definition.image] : [],
    );

    expect(images).toEqual([
      expect.objectContaining({
        src: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/In_the_tree_by_Eddie_calz.jpg",
        title: "In the Tree",
        artist: "Eddie Calz",
      }),
      expect.objectContaining({
        src: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/deliriants.jpg",
        title: "700mg Diphenhydramine",
        artist: "Stas Constantine",
      }),
    ]);
  });
});
