import { describe, expect, it } from "vitest";
import { extractSegments, segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import { articleReadMinutes, deriveDescription, groupArticlesForIndex } from "../../src/features/articles/domain/articlesIndex";
import type { PublicEffectIndexArticle } from "../data/publicData.shared";
import { LIBRARY_TRANSLATION_CORPUS, projectLocalizedPublicationIndex } from "./publicationIndexProjection";
import { readLocalizedPublicationIndex } from "./publicationIndexStore";

const article: PublicEffectIndexArticle = {
  slug: "overlay-fixture", title: "A publication title", tags: [], publication_status: "published",
  body_raw: `[h2]Overview[/h2]\n${"English prose ".repeat(220)}ends here.`,
};

function storedBody(target: string) {
  const translations = new Map([[segmentHash(article.title), "文章标题"]]);
  for (const segment of extractSegments({ items: [article] }, LIBRARY_TRANSLATION_CORPUS).segments) {
    if (segment.group === "body_raw" && segment.source.includes("English prose")) translations.set(segment.hash, target);
  }
  return translations;
}

describe("localized publication index projection", () => {
  it("measures the stored overlay exactly and falls back only for a changed English leaf", () => {
    const translations = storedBody("这是存储的译文。");
    const translated = projectLocalizedPublicationIndex(article, "zh-Hans", translations);
    expect(translated.title).toBe("文章标题");
    expect(translated.indexDescription).toBe("这是存储的译文。");
    expect(translated.readMinutes).toBe(1);

    const edited = { ...article, body_raw: `A changed opening. ${"New English prose ".repeat(220)}` };
    const missing = projectLocalizedPublicationIndex(edited, "zh-Hans", translations);
    expect(missing.title).toBe("文章标题");
    expect(missing.indexDescription).toBe("A changed opening.");
    expect(missing.readMinutes).toBe(3);
    expect(missing.overlayRevision).not.toBe(translated.overlayRevision);
  });

  it("recomputes metadata when the same source hash gets a replacement target", () => {
    const short = projectLocalizedPublicationIndex(article, "zh-Hans", storedBody("短译文。"));
    const long = projectLocalizedPublicationIndex(article, "zh-Hans", storedBody(`Replacement opening. ${"translated prose ".repeat(440)}`));
    expect(long.indexDescription).toBe("Replacement opening.");
    expect(long.readMinutes).toBe(4);
    expect(long.overlayRevision).not.toBe(short.overlayRevision);
  });

  it("keeps English body metadata when an overlay changes VCode structure", () => {
    const rejected = projectLocalizedPublicationIndex(article, "zh-Hans", storedBody("[h2]Injected heading[/h2]"));
    expect(rejected.title).toBe("文章标题");
    expect(rejected.indexDescription).toBe(deriveDescription(article.body_raw));
    expect(rejected.readMinutes).toBe(articleReadMinutes(article.body_raw));
  });

  it("preserves short-description precedence and legacy missing-kind classification", () => {
    const described = { ...article, shortDescription: "A hand-written blurb." };
    const translations = storedBody("正文。");
    translations.set(segmentHash(described.shortDescription), "  简短介绍。  ");
    const projection = projectLocalizedPublicationIndex(described, "zh-Hans", translations);
    const groups = groupArticlesForIndex([{ slug: described.slug, tags: described.tags, ...projection }]);
    expect(groups.flatMap((group) => group.articles).find((row) => row.slug === described.slug)?.description).toBe("简短介绍。");
  });
});

describe("localized publication index readiness", () => {
  it("refuses a missing or invalidated snapshot instead of hiding its article", async () => {
    for (const dirty of [null, true]) {
      const client = { query: async () => ({ rows: [{ slug: article.slug, dirty, title: null, overlay_revision: null }], rowCount: 1 }) };
      await expect(readLocalizedPublicationIndex(client, "zh-Hans")).rejects.toThrow(`zh-Hans/${article.slug}`);
    }
  });
});
