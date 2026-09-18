import { describe, expect, it } from "vitest";
import { getManagedImageCandidates, isManagedResponsiveImage, MANAGED_MEDIA_HOST } from "./r2ImagePolicy";

const key = `media/sha256/ab/${"ab".padEnd(64, "0")}.webp`;
const managed = `https://${MANAGED_MEDIA_HOST}/${key}`;
const legacy = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/Forest%20painting.png";

describe("managed responsive image delivery", () => {
  it("recognizes canonical managed raster originals", () => {
    for (const extension of ["jpg", "jpeg", "png", "webp", "avif"]) {
      expect(isManagedResponsiveImage(managed.replace(".webp", `.${extension}`))).toBe(true);
    }
  });

  it("never creates rendition candidates for noncanonical, private or external sources", () => {
    for (const src of [
      legacy,
      managed.replace("https:", "http:"),
      managed.replace(MANAGED_MEDIA_HOST, `${MANAGED_MEDIA_HOST}.attacker.test`),
      managed.replace("https://", "https://user@"),
      managed.replace(MANAGED_MEDIA_HOST, `${MANAGED_MEDIA_HOST}:8443`),
      managed.replace("/ab/", "/cd/"),
      managed.replace(".webp", ".gif"),
      managed.replace(".webp", ".svg"),
      managed.replace(".webp", ".mp4"),
      managed.replace(key, `_renditions/v1/${key}/384.webp`),
      managed.replace(key, `_withdrawals/${key}`),
      managed.replace("/media/", "/ignored/../media/"),
      `${managed}?width=384`,
      `${managed}?`,
      `${managed}#`,
      "not a URL",
    ]) {
      expect(isManagedResponsiveImage(src)).toBe(false);
      expect(getManagedImageCandidates(src, 128, "100vw")).toBeNull();
    }
  });
});
