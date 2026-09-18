import { describe, expect, it } from "vitest";
import type { EffectDetail } from "@/data/builders/library";
import {
  buildEffectArticleModel,
  getEffectArticleReplicationState,
  type SubjectiveEffectArticle,
} from "./articleSectionModel";

const minimalEffect: SubjectiveEffectArticle = {
  slug: "patterning",
  name: "Patterning",
  tags: ["Visual"],
  summary: "Visual pattern summary.",
  description_raw: "Raw overview",
};

const effectDetail: EffectDetail = {
  definition: {
    name: "Patterning",
    slug: "patterning",
    total: 2,
  },
  groups: [
    {
      key: "psychedelics",
      name: "Psychedelics",
      icon: "lucide:sparkles",
      total: 2,
      drugs: [
        { name: "LSD", slug: "lsd" },
        { name: "Psilocybin", slug: "psilocybin" },
      ],
    },
  ],
};

describe("effect article section model", () => {
  it("creates ordered public article sections for full content", () => {
    const model = buildEffectArticleModel({
      effect: {
        ...minimalEffect,
        analysis_raw: "Analysis",
        style_variations_raw: "Style",
        gallery_order: ["first-replication"],
        audio_replications: [
          { title: "Tone", artist: "Artist", resource: "/audio/tone.mp3" },
        ],
        personal_commentary_raw: "Commentary",
        citations: [{ url: "https://example.com", text: "Example" }],
        external_links: [{ url: "https://external.example", title: "External" }],
        see_also: [{ location: "/effects/tracers", title: "Tracers" }],
        contributors: ["Ada Lovelace"],
      },
      effectDetail,
      replications: { kind: "server", galleryOrder: ["first-replication"] },
    });

    expect(model.sections.map(section => section.kind)).toEqual([
      "overview",
      "analysis",
      "styleVariations",
      "replications",
      "audioReplications",
      "personalCommentary",
      "relatedSubstances",
      "sources",
      "contributors",
    ]);
  });

  it("keeps minimal content to only the overview section", () => {
    const model = buildEffectArticleModel({ effect: minimalEffect });

    expect(model.sections.map(section => section.kind)).toEqual(["overview"]);
  });

  it("marks disconnective effects with the class whose scale grades them", () => {
    expect(buildEffectArticleModel({ effect: minimalEffect }).hero.guideClass).toBeUndefined();

    const disconnective = buildEffectArticleModel({
      effect: { ...minimalEffect, tags: ["Visual", "Disconnective"] },
    });

    expect(disconnective.hero.guideClass).toBe("dissociative");
  });

  it("prefers AST content over raw content", () => {
    const ast = {
      name: "paragraph",
      properties: {},
      children: ["AST overview"],
    };
    const model = buildEffectArticleModel({
      effect: {
        ...minimalEffect,
        description_ast: ast,
        description_raw: "Raw fallback",
      },
    });

    expect(model.sections[0]).toMatchObject({
      kind: "overview",
      content: ast,
    });
  });

  it("falls back to raw content when AST content is not renderer-compatible", () => {
    const model = buildEffectArticleModel({
      effect: {
        ...minimalEffect,
        description_ast: { type: "doc", content: [{ type: "paragraph" }] },
        description_raw: "Raw fallback",
      },
    });

    expect(model.sections[0]).toMatchObject({
      kind: "overview",
      content: "Raw fallback",
    });
  });

  it("can model a fallback replication section without fetched replications", () => {
    const model = buildEffectArticleModel({
      effect: { ...minimalEffect, gallery_order: ["missing-replication"] },
      replications: { kind: "fallback", galleryOrder: ["missing-replication"] },
    });

    expect(model.sections).toContainEqual({
      id: "replications",
      kind: "replications",
      title: "Replications",
      icon: "lucide:image",
      state: { kind: "fallback", galleryOrder: ["missing-replication"] },
    });
  });

  it("keeps audio-only replication content separate from image/video replications", () => {
    const model = buildEffectArticleModel({
      effect: {
        ...minimalEffect,
        audio_replications: [
          { title: "Audio", artist: "Artist", resource: "/audio.mp3" },
        ],
      },
      replications: { kind: "none" },
    });

    expect(model.sections.map(section => section.kind)).toEqual(["overview", "audioReplications"]);
  });

  it("projects related substances from effect detail", () => {
    const model = buildEffectArticleModel({ effect: minimalEffect, effectDetail });

    expect(model.sections.find(section => section.kind === "relatedSubstances")).toMatchObject({
      kind: "relatedSubstances",
      groups: effectDetail.groups,
      total: 2,
    });
  });

  it("selects the server replication state from gallery order", () => {
    expect(getEffectArticleReplicationState({
      ...minimalEffect,
      gallery_order: ["ordered"],
    })).toEqual({ kind: "server", galleryOrder: ["ordered"] });
    expect(getEffectArticleReplicationState(minimalEffect)).toEqual({ kind: "none" });
  });
});
