import { describe, expect, it } from "vitest";
import { buildSlugCandidate, normalizeSlug, planSlugRenames } from "./normalize-slugs.mjs";

describe("normalizeSlug", () => {
  it("converts underscores to hyphens", () => {
    expect(normalizeSlug("cubism_field_by_chelsea_morgan")).toBe("cubism-field-chelsea-morgan");
  });

  it("strips upscaler and pipeline debris", () => {
    expect(normalizeSlug("double_vision-chelsea-morgan_upscayl_4x_realesrgan-x4plus")).toBe(
      "double-vision-chelsea-morgan",
    );
    expect(normalizeSlug("asphalt_photos_v2_x2")).toBe("asphalt");
  });

  it("drops the importer's -unknown tail", () => {
    expect(normalizeSlug("flowing_fruit-unknown")).toBe("flowing-fruit");
  });

  it("keeps the slug non-empty when unknown is all there is", () => {
    expect(normalizeSlug("unknown")).toBe("unknown");
  });
});

describe("buildSlugCandidate", () => {
  it("builds the slug from the work's title and creator", () => {
    expect(
      buildSlugCandidate({
        slug: "8696092281_e167055dd3_k-unknown",
        title: "After images",
        artist: "Chelsea Morgan",
      }),
    ).toBe("after-images-chelsea-morgan");
  });

  it("does not repeat a creator the title already ends with", () => {
    expect(
      buildSlugCandidate({
        slug: "whatever_file",
        title: "Tree Bark by Chelsea Morgan",
        artist: "Chelsea Morgan",
      }),
    ).toBe("tree-bark-by-chelsea-morgan");
  });

  it("omits the creator when nobody is credited", () => {
    expect(
      buildSlugCandidate({ slug: "day_tripping-unknown", title: "Day tripping", artist: "Unknown" }),
    ).toBe("day-tripping");
  });

  it("falls back to the cleaned filename when the title is itself a filename", () => {
    expect(
      buildSlugCandidate({
        slug: "hgcjhgcjg_digital_art_x4-unknown",
        title: "hgcjhgcjg_digital_art_x4",
        artist: "Unknown",
      }),
    ).toBe("hgcjhgcjg");
  });

  it("transliterates accented names instead of hyphenating them apart", () => {
    expect(
      buildSlugCandidate({ slug: "1wjjblc-unknown", title: "Untitled", artist: "Zdzisław Beksiński" }),
    ).toBe("untitled-zdzislaw-beksinski");
    expect(
      buildSlugCandidate({ slug: "x", title: "Blue Café", artist: "Renée Ångström" }),
    ).toBe("blue-cafe-renee-angstrom");
  });

  it("caps runaway titles on a word boundary", () => {
    const slug = buildSlugCandidate({
      slug: "long_one",
      title: "A very long replication title that simply keeps going and going well past any reasonable url length",
      artist: "Someone",
    });

    expect(slug.length).toBeLessThanOrEqual(72);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("planSlugRenames", () => {
  const make = (slug, extra = {}) => ({
    slug,
    title: slug,
    artist: "Unknown",
    effect_slug: "tracers",
    ...extra,
  });

  it("only plans renames for slugs that are not kebab-case", () => {
    const { renames } = planSlugRenames([make("already-clean"), make("needs_fixing")]);

    expect(renames).toHaveLength(1);
    expect(renames[0]).toMatchObject({ from: "needs_fixing", to: "needs-fixing" });
  });

  it("never collides with a slug that already exists", () => {
    const { renames } = planSlugRenames([make("tree-bark"), make("tree_bark")]);

    expect(renames[0].to).toBe("tree-bark-2");
  });

  it("never collides with another slug planned in the same run", () => {
    const { renames } = planSlugRenames([make("tree_bark"), make("tree bark")]);
    const targets = renames.map((rename) => rename.to);

    expect(new Set(targets).size).toBe(targets.length);
  });

  it("moves a slug that would shadow a static /replications page", () => {
    const { renames } = planSlugRenames([make("audio")]);

    expect(renames[0]).toMatchObject({ from: "audio", to: "audio-replication" });
  });

  it("refuses to rename a slug held by more than one row", () => {
    const { renames, skipped, duplicates } = planSlugRenames([
      make("shadow_people-unknown"),
      make("shadow_people-unknown"),
    ]);

    expect(renames).toHaveLength(0);
    expect(skipped.every((entry) => entry.reason.includes("duplicate"))).toBe(true);
    expect(duplicates).toEqual([{ slug: "shadow_people-unknown", count: 2 }]);
  });

  it("reports duplicates even when the slug needs no rename", () => {
    const { renames, duplicates } = planSlugRenames([make("shadow-people"), make("shadow-people")]);

    expect(renames).toHaveLength(0);
    expect(duplicates).toEqual([{ slug: "shadow-people", count: 2 }]);
  });

  it("is deterministic across runs", () => {
    const input = [make("b_two"), make("a_one"), make("c_three")];

    expect(planSlugRenames(input)).toEqual(planSlugRenames([...input].reverse()));
  });
});
