import {
  PUBLIC_CHANGELOG_LISTS_TAG,
  PUBLIC_DATA_CACHE_TAGS,
  PUBLIC_SUBSTANCE_CONTENT_TAG,
  PUBLIC_SUBSTANCE_DOCUMENTS_TAG,
  PUBLIC_SUBSTANCE_LISTS_TAG,
  publicArticleHistoryTag,
  publicEffectTag,
  publicMoleculeTag,
  publicSubstanceGalleryTag,
  publicSubstanceTag,
} from "../data/publicData.cacheTags";
import {
  localizedArticlePaths,
  localizedEffectPaths,
  localizedIndexPaths,
  localizedLibraryPaths,
  localizedReplicationPaths,
  localizedReportPaths,
  LIVE_LOCALES,
  localizedReplicationViewerRoutePath,
} from "./localeHostPolicy";

import type { PublicationTarget } from "./publicationWire";

export type PublicationEffect = {
  paths: { path: string; type?: "page" | "layout" }[];
  tags: string[];
};

const REPLICATION_SHOWCASE_PATH = "/api/replications/showcase";

function resolvePublicationEffect(
  target: PublicationTarget,
): PublicationEffect {
  switch (target.kind) {
    case "article": {
      const contentChanged = target.dependency !== "detail";
      const membershipChanged =
        target.dependency === undefined || target.dependency === "membership";
      return {
        paths: [
          { path: `/${target.slug}` },
          ...localizedArticlePaths(target.slug).map((path) => ({ path })),
        ],
        tags: [
          publicSubstanceTag(target.slug),
          publicArticleHistoryTag(target.slug),
          PUBLIC_CHANGELOG_LISTS_TAG,
          PUBLIC_SUBSTANCE_DOCUMENTS_TAG,
          ...(contentChanged ? [PUBLIC_SUBSTANCE_CONTENT_TAG] : []),
          ...(membershipChanged
            ? [
                publicSubstanceGalleryTag(target.slug),
                PUBLIC_SUBSTANCE_LISTS_TAG,
              ]
            : []),
        ],
      };
    }
    case "article-translation": {
      const locale = Object.values(LIVE_LOCALES).find(
        ({ code }) => code === target.locale,
      );
      if (!locale) return { paths: [], tags: [] };
      return {
        paths: [
          { path: `${locale.pathPrefix}/${target.slug}` },
          { path: `${locale.pathPrefix}/substances` },
        ],
        tags: [],
      };
    }
    case "effect":
      return {
        paths: [
          { path: `/effects/${target.slug}` },
          ...localizedEffectPaths(target.slug).map((path) => ({ path })),
        ],
        tags: [publicEffectTag(target.slug), PUBLIC_DATA_CACHE_TAGS.effects],
      };
    case "contributor":
      return {
        paths: [
          { path: `/contributors/${target.slug}` },
          { path: "/replications/artist/[key]", type: "page" },
        ],
        tags: [PUBLIC_DATA_CACHE_TAGS.contributors],
      };
    case "chemical-class":
      return {
        paths: [{ path: `/chemical-classes/${target.slug}` }],
        tags: [PUBLIC_SUBSTANCE_LISTS_TAG],
      };
    case "molecule":
      return {
        paths: [
          target.slug.startsWith("class:")
            ? {
                path: `/chemical-classes/${target.slug.slice("class:".length)}`,
              }
            : { path: `/${target.slug}` },
        ],
        tags: [
          publicMoleculeTag(target.slug),
          PUBLIC_DATA_CACHE_TAGS.molecules,
        ],
      };
    case "report":
      return {
        paths: [
          { path: `/reports/${target.slug}` },
          ...localizedReportPaths(target.slug).map((path) => ({ path })),
        ],
        tags: [PUBLIC_DATA_CACHE_TAGS.reports],
      };
    case "library":
      return {
        paths: [
          { path: `/articles/${target.slug}` },
          { path: "/articles" },
          ...localizedLibraryPaths(target.slug).map((path) => ({ path })),
          ...localizedIndexPaths("/articles").map((path) => ({ path })),
        ],
        tags: [PUBLIC_DATA_CACHE_TAGS.articles],
      };
    case "replication":
      return {
        paths: [
          { path: `/replications/${target.slug}` },
          { path: `/replications/viewer/${target.slug}` },
          { path: "/replications" },
          ...localizedReplicationPaths(target.slug).map((path) => ({ path })),
          ...Object.values(LIVE_LOCALES).map((locale) => ({
            path: localizedReplicationViewerRoutePath(locale, target.slug),
          })),
          ...localizedIndexPaths("/replications").map((path) => ({ path })),
        ],
        tags: [PUBLIC_DATA_CACHE_TAGS.replications],
      };
    case "blog-post":
      return {
        paths: [{ path: `/blog/${target.slug}` }],
        tags: [PUBLIC_DATA_CACHE_TAGS.blog],
      };
    case "substance-lists":
      return {
        paths: [
          { path: "/substances" },
          ...localizedIndexPaths("/substances").map((path) => ({ path })),
        ],
        tags: [PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_DATA_CACHE_TAGS.layouts],
      };
    case "chemical-lists":
      return {
        paths: [{ path: "/chemical" }],
        tags: [PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_DATA_CACHE_TAGS.layouts],
      };
    case "mechanism-lists":
      return {
        paths: [{ path: "/mechanism" }],
        tags: [PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_DATA_CACHE_TAGS.layouts],
      };
    case "chemical-class-lists":
      return {
        paths: [{ path: "/chemical-classes", type: "layout" }],
        tags: [PUBLIC_SUBSTANCE_LISTS_TAG],
      };
    case "effect-lists":
      return {
        paths: [
          { path: "/effects" },
          ...localizedIndexPaths("/effects").map((path) => ({ path })),
        ],
        tags: [PUBLIC_DATA_CACHE_TAGS.effects],
      };
    case "report-lists":
      return {
        paths: [
          { path: "/reports" },
          ...localizedIndexPaths("/reports").map((path) => ({ path })),
        ],
        tags: [PUBLIC_DATA_CACHE_TAGS.reports],
      };
    case "replication-collections":
      return {
        paths: [{ path: REPLICATION_SHOWCASE_PATH }],
        tags: [PUBLIC_DATA_CACHE_TAGS.replications],
      };
    case "featured-replications":
      return {
        paths: [{ path: "/" }],
        tags: [PUBLIC_DATA_CACHE_TAGS.featuredReplications],
      };
    case "contributor-lists":
      return {
        paths: [{ path: "/contributors" }],
        tags: [PUBLIC_DATA_CACHE_TAGS.contributors],
      };
    case "writing-articles":
      return { paths: [], tags: [PUBLIC_DATA_CACHE_TAGS.articles] };
    case "changelog":
      return {
        paths: [{ path: "/changes" }],
        tags: [PUBLIC_CHANGELOG_LISTS_TAG],
      };
    case "about":
      return {
        paths: [{ path: "/about" }],
        tags: [PUBLIC_DATA_CACHE_TAGS.about],
      };
    case "copy":
      return { paths: [], tags: [PUBLIC_DATA_CACHE_TAGS.copy] };
    case "banners":
      return { paths: [], tags: [PUBLIC_DATA_CACHE_TAGS.banners] };
    case "home":
      return { paths: [{ path: "/" }], tags: [] };
  }
}

export function resolvePublicationEffects(
  targets: readonly PublicationTarget[],
): PublicationEffect {
  const paths = new Map<string, { path: string; type?: "page" | "layout" }>();
  const tags = new Set<string>();
  for (const target of targets) {
    const effect = resolvePublicationEffect(target);
    for (const entry of effect.paths)
      paths.set(`${entry.path}\u0000${entry.type ?? ""}`, entry);
    for (const tag of effect.tags) tags.add(tag);
  }
  return { paths: [...paths.values()], tags: [...tags] };
}

export function publicationTargetForSavedPath(
  path: string,
): PublicationTarget | null {
  switch (path) {
    case "/":
      return { kind: "home" };
    case "/copy-blocks":
      return { kind: "copy" };
    case "/about":
      return { kind: "about" };
    case "/substances":
      return { kind: "substance-lists" };
    case "/chemical":
      return { kind: "chemical-lists" };
    case "/mechanism":
      return { kind: "mechanism-lists" };
    case "/chemical-classes":
      return { kind: "chemical-class-lists" };
    case "/effects":
      return { kind: "effect-lists" };
    case "/reports":
      return { kind: "report-lists" };
    case "/articles":
      return { kind: "writing-articles" };
    case "/changes":
      return { kind: "changelog" };
    case REPLICATION_SHOWCASE_PATH:
      return { kind: "replication-collections" };
    default:
      break;
  }
  const article = /^\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (article) return { kind: "article", slug: article[1] };
  const effect = /^\/effects\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (effect) return { kind: "effect", slug: effect[1] };
  const report = /^\/reports\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (report) return { kind: "report", slug: report[1] };
  const library = /^\/articles\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (library) return { kind: "library", slug: library[1] };
  const replication = /^\/replications\/([a-z0-9][a-z0-9_-]*)$/.exec(path);
  if (replication) return { kind: "replication", slug: replication[1] };
  const post = /^\/blog\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (post) return { kind: "blog-post", slug: post[1] };
  const chemicalClass = /^\/chemical-classes\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  if (chemicalClass) return { kind: "chemical-class", slug: chemicalClass[1] };
  const contributor = /^\/contributors\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(
    path,
  );
  if (contributor) return { kind: "contributor", slug: contributor[1] };
  return null;
}
