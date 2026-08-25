import { describe, expect, it } from "vitest";

import { planGalleryRegeneration } from "./regenerate-substance-galleries.mjs";

function article(slug, title, psychoactiveClass = []) {
  return { slug, title, classification: { psychoactive_class: psychoactiveClass } };
}

function drug(slug, name, drugClass) {
  return { slug, name, class: drugClass, matched_title_text: name };
}

function classMention(drugClass) {
  return { class: drugClass, matched_title_text: drugClass };
}

function row(slug, overrides = {}) {
  return {
    slug,
    title: slug,
    artist: "Replicator",
    type: "image",
    role: "replication",
    replication_status: "replication",
    title_drugs: [],
    title_class_mentions: [],
    ...overrides,
  };
}

function gallery(curated_slugs = [], removed_slugs = []) {
  return {
    curated_slugs,
    removed_slugs,
    updated_at: "2026-08-25T00:00:00.000Z",
  };
}

const DMT = drug("dmt", "DMT", "psychedelics");
const DPH = drug("diphenhydramine", "Diphenhydramine", "deliriants");
const SALVIA = drug("salvia", "Salvia", "other");
const LSD = drug("lsd", "LSD", "psychedelics");

const REPlications = [
  row("dmt-image", { title_drugs: [DMT] }),
  row("dmt-video", { type: "video", title_drugs: [DMT] }),
  row("general-dissociative", { title_class_mentions: [classMention("dissociatives")] }),
  row("general-deliriant", { title_class_mentions: [classMention("deliriants")] }),
  row("visual-disconnection-still", { effect_slug: "visual-disconnection" }),
  row("dph-image", { title_drugs: [DPH] }),
  row("salvia-image", { title_drugs: [SALVIA] }),
  row("salvia-video", { type: "video", title_drugs: [SALVIA] }),
  row("the-clockwork-suburb-salviadroid", { artist: "Salviadroid" }),
  row("seers-portal-salviadroid", { artist: "Salviadroid" }),
  row("untagged-salviadroid", { artist: "Salviadroid" }),
  row("lsd-image", { title_drugs: [LSD] }),
  row("general-psychedelic", { title_class_mentions: [classMention("psychedelics")] }),
  row("dmt-dph-combination", { title_drugs: [DMT, DPH] }),
  row("old-effect-match"),
  row("manual-exclusion"),
];

const SUBSTANCES = [
  article("dmt", "DMT", ["Psychedelic"]),
  article("ketamine", "Ketamine", ["Dissociative"]),
  article("datura", "Datura", ["Deliriant"]),
  article("diphenhydramine", "Diphenhydramine", ["Deliriant"]),
  article("salvia", "Salvia", ["Hallucinogen"]),
  article("lsd", "LSD", ["Psychedelic"]),
];

describe("planGalleryRegeneration", () => {
  it("rebuilds exact-drug priorities video-first and leaves class work automatic", () => {
    const plans = planGalleryRegeneration({
      replications: REPlications,
      substances: SUBSTANCES,
      galleriesBySubstance: new Map([
        ["dmt", gallery(["old-effect-match", "dmt-image"], ["dmt-dph-combination", "missing"])],
        ["ketamine", gallery(["old-effect-match"])],
        ["datura", gallery(["old-effect-match"])],
        ["diphenhydramine", gallery()],
        ["lsd", gallery(["old-effect-match"])],
      ]),
    });
    const bySlug = new Map(plans.map((plan) => [plan.substance_slug, plan]));

    expect(bySlug.get("dmt").next).toEqual({
      curated_slugs: ["dmt-video", "dmt-image"],
      removed_slugs: [],
    });
    expect(bySlug.get("ketamine").next.curated_slugs).toEqual([]);
    expect(bySlug.get("ketamine").automatic).toEqual({
      specific: 0,
      general_class: 1,
      visual_disconnection: 1,
    });
    expect(bySlug.get("ketamine").next.curated_slugs).not.toContain("visual-disconnection-still");
    expect(bySlug.get("datura").next.curated_slugs).toEqual([]);
    expect(bySlug.get("datura").automatic).toEqual({
      specific: 0,
      general_class: 1,
      visual_disconnection: 0,
    });
    expect(bySlug.get("diphenhydramine").next.curated_slugs).toEqual(["dph-image"]);
    expect(bySlug.get("diphenhydramine").automatic).toEqual({
      specific: 1,
      general_class: 1,
      visual_disconnection: 0,
    });
    expect(bySlug.get("lsd").next.curated_slugs).toEqual(["lsd-image"]);
    expect(bySlug.get("lsd").automatic.general_class).toBe(0);
  });

  it("keeps only the two audited Salviadroid associations and promotes Salvia video first", () => {
    const [plan] = planGalleryRegeneration({
      replications: REPlications,
      substances: [article("salvia", "Salvia")],
      galleriesBySubstance: new Map([
        ["salvia", gallery([
          "salvia-image",
          "the-clockwork-suburb-salviadroid",
          "seers-portal-salviadroid",
          "untagged-salviadroid",
        ])],
      ]),
    });

    expect(plan.next.curated_slugs).toEqual([
      "salvia-video",
      "salvia-image",
      "the-clockwork-suburb-salviadroid",
      "seers-portal-salviadroid",
    ]);
    expect(plan.dropped_priorities.map((entry) => entry.slug)).toEqual(["untagged-salviadroid"]);
  });

  it("never carries combinations or missing rows into priorities or exclusions", () => {
    const [plan] = planGalleryRegeneration({
      replications: REPlications,
      substances: [article("dmt", "DMT", ["Psychedelic"])],
      galleriesBySubstance: new Map([
        ["dmt", gallery(["dmt-dph-combination"], ["dmt-dph-combination", "missing", "manual-exclusion"])],
      ]),
    });

    expect(plan.next.curated_slugs).not.toContain("dmt-dph-combination");
    expect(plan.next.removed_slugs).toEqual(["manual-exclusion"]);
    expect(plan.dropped_exclusions).toEqual(["dmt-dph-combination", "missing"]);
  });

  it("fails closed when two articles claim the same route", () => {
    expect(() => planGalleryRegeneration({
      replications: [],
      substances: [article("dmt", "DMT"), article("dmt", "Duplicate")],
      galleriesBySubstance: new Map(),
    })).toThrow(/Duplicated substance article slugs: dmt/);
  });
});
