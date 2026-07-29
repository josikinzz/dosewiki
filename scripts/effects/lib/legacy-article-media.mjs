const R2_PREFIX = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/";
const GALLERY_PREFIX = "/img/gallery/";

const mediaUrlPattern = /(?:https:\/\/pub-879bfd45a9774f1c80a8b77aca1f0aee\.r2\.dev\/|\/img\/gallery\/)(?:%[\da-fA-F]{2}|[^\s"'<>\]:])+/g;
const captionedImagePattern = /\[captioned-image\b[^\]]*?\bsrc="([^"]+)"[^\]]*?\/\]/g;

export function isLegacyArticleMediaUrl(value) {
  return typeof value === "string" &&
    (value.startsWith(R2_PREFIX) || value.startsWith(GALLERY_PREFIX));
}

export function legacyArticleMediaKey(value) {
  if (!isLegacyArticleMediaUrl(value)) return null;
  const path = value.startsWith(R2_PREFIX)
    ? new URL(value).pathname
    : value.slice(GALLERY_PREFIX.length);
  const basename = decodeURIComponent(path).split("/").filter(Boolean).at(-1) ?? "";
  return basename.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function legacyUrlsInString(value) {
  return [...value.matchAll(mediaUrlPattern)].map((match) => match[0]);
}

export function collectLegacyArticleMediaKeys(value, keys = new Set()) {
  if (typeof value === "string") {
    for (const url of legacyUrlsInString(value)) {
      const key = legacyArticleMediaKey(url);
      if (key) keys.add(key);
    }
    return keys;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLegacyArticleMediaKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectLegacyArticleMediaKeys(item, keys);
  }
  return keys;
}

function replaceString(value, replacements) {
  const withoutMissingImages = value.replace(
    captionedImagePattern,
    (tag, src) => {
      const key = legacyArticleMediaKey(src);
      return key && !replacements.has(key) ? "" : tag;
    },
  );

  return withoutMissingImages.replace(mediaUrlPattern, (url) => {
    const key = legacyArticleMediaKey(url);
    return key ? (replacements.get(key) ?? "") : url;
  });
}

export function replaceLegacyArticleMedia(value, replacements) {
  if (typeof value === "string") return replaceString(value, replacements);
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        item.name === "captioned-image" &&
        isLegacyArticleMediaUrl(item.properties?.src)
      ) {
        const key = legacyArticleMediaKey(item.properties.src);
        if (key && !replacements.has(key)) return [];
      }
      return [replaceLegacyArticleMedia(item, replacements)];
    });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceLegacyArticleMedia(item, replacements),
      ]),
    );
  }
  return value;
}
