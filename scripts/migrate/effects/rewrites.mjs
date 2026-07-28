import { LINK_REWRITES, R2_CDN_BASE, TAG_NORMALIZATION } from "./config.mjs";

export function normalizeTag(tag) {
  const lower = tag.toLowerCase().trim();
  return TAG_NORMALIZATION[tag] || TAG_NORMALIZATION[lower] || lower;
}

export function buildAssetMap(replications) {
  const assetMap = new Map();

  for (const replication of replications) {
    if (!replication.resource) continue;

    if (replication.resource.startsWith("http")) {
      let filename;
      try {
        const url = new URL(replication.resource);
        filename = decodeURIComponent(url.pathname.split("/").pop());
      } catch {
        filename = replication.resource.split("/").pop();
      }

      assetMap.set(`/img/gallery/${replication.title}.jpg`, replication.resource);
      assetMap.set(`/img/gallery/${replication.title}.png`, replication.resource);
      assetMap.set(`/img/gallery/${filename}`, replication.resource);
      if (replication.url) {
        assetMap.set(`/img/gallery/${replication.url}.jpg`, replication.resource);
        assetMap.set(`/img/gallery/${replication.url}.png`, replication.resource);
      }
      continue;
    }

    const r2Url = `${R2_CDN_BASE}/${encodeURIComponent(replication.resource)}`;
    assetMap.set(`/img/gallery/${replication.resource}`, r2Url);
    if (replication.title) {
      assetMap.set(`/img/gallery/${replication.title}.jpg`, r2Url);
      assetMap.set(`/img/gallery/${replication.title}.png`, r2Url);
      assetMap.set(`/img/gallery/${replication.title}.gif`, r2Url);
      assetMap.set(`/img/gallery/${replication.title}.webp`, r2Url);
    }
  }

  return assetMap;
}

export function rewriteAssetUrls(content, assetMap) {
  if (!content) return content;

  return content.replace(/src="(\/img\/gallery\/[^"]+)"/g, (match, assetPath) => {
    return `src="${rewriteAssetPath(assetPath, assetMap)}"`;
  });
}

export function rewriteAssetPath(assetPath, assetMap) {
  if (!assetPath?.startsWith("/img/gallery/")) return assetPath;

  const mappedUrl = assetMap.get(assetPath);
  if (mappedUrl) return mappedUrl;

  try {
    const decodedPath = decodeURIComponent(assetPath);
    const decodedMappedUrl = assetMap.get(decodedPath);
    if (decodedMappedUrl) return decodedMappedUrl;
  } catch {
    // Keep the original encoded path when it cannot be decoded.
  }

  const filename = assetPath.replace("/img/gallery/", "");
  return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
}

export function rewriteSocialMediaImage(imagePath, assetMap) {
  if (!imagePath) return undefined;
  const mappedUrl = assetMap.get(imagePath);
  if (mappedUrl) return mappedUrl;
  if (imagePath.startsWith("http")) return imagePath;

  const filename = imagePath.replace("/img/gallery/", "");
  return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
}

export function rewriteInternalLinks(content) {
  if (!content) return content;

  return content.replace(/\[int-link to="([^"]+)"\]/g, (match, linkPath) => {
    const rewritten = rewriteInternalLinkTarget(linkPath);
    return rewritten === linkPath ? match : `[int-link to="${rewritten}"]`;
  });
}

export function rewriteInternalLinkTarget(linkPath) {
  if (LINK_REWRITES[linkPath]) {
    return LINK_REWRITES[linkPath];
  }

  for (const [prefix, replacement] of Object.entries(LINK_REWRITES)) {
    if (linkPath.startsWith(prefix)) {
      return linkPath.replace(prefix, replacement).replace(/\/$/, "");
    }
  }

  return linkPath;
}

export function rewriteSeeAlso(seeAlso) {
  if (!seeAlso || !Array.isArray(seeAlso)) return undefined;

  return seeAlso.map((item) => {
    let location = item.location;
    if (LINK_REWRITES[location]) {
      location = LINK_REWRITES[location];
    } else {
      for (const [prefix, replacement] of Object.entries(LINK_REWRITES)) {
        if (location.startsWith(prefix)) {
          location = location.replace(prefix, replacement).replace(/\/$/, "");
          break;
        }
      }
    }

    return {
      location,
      title: item.title,
    };
  });
}
