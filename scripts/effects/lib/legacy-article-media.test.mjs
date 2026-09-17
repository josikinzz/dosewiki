import { describe, expect, it } from "vitest";
import {
  collectLegacyArticleMediaKeys,
  legacyArticleMediaKey,
  replaceLegacyArticleMedia,
} from "./legacy-article-media.mjs";

const r2 = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/";

describe("legacy article media", () => {
  it("normalizes relative and encoded R2 references to one key", () => {
    expect(legacyArticleMediaKey("/img/gallery/Alice.png")).toBe("alicepng");
    expect(legacyArticleMediaKey(`${r2}img%2Fgallery%2FAlice.png`)).toBe("alicepng");
  });

  it("replaces recovered media and removes an unrecoverable captioned image", () => {
    const value = [
      {
        name: "captioned-image",
        properties: { src: "/img/gallery/Alice.png", title: "Alice" },
      },
      {
        name: "captioned-image",
        properties: { src: `${r2}missing.jpg`, title: "Missing" },
      },
      `before [captioned-image src="${r2}missing.jpg" title="Missing" /] after`,
    ];
    const replacements = new Map([["alicepng", "https://media.example.invalid/api/storage/alice"]]);

    expect([...collectLegacyArticleMediaKeys(value)].sort()).toEqual([
      "alicepng",
      "missingjpg",
    ]);
    expect(replaceLegacyArticleMedia(value, replacements)).toEqual([
      {
        name: "captioned-image",
        properties: {
          src: "https://media.example.invalid/api/storage/alice",
          title: "Alice",
        },
      },
      "before  after",
    ]);
  });
});
