/**
 * The wire contract between an editorial write and the public deployments that
 * serve its content.
 *
 * A Next cache invalidation is project-local: the editor deployment expiring
 * its own tags does nothing to the two public projects, which keep serving the
 * previous revision until their own interval elapses. The publication signal
 * closes that gap, and this module is the part both ends must agree on.
 *
 * The receiver never accepts a caller-supplied tag or an arbitrary URL. It
 * accepts content identities in the shapes below, and derives the tags itself
 * from the same table the editor uses, so a compromised or buggy caller cannot
 * expire unrelated caches or aim a revalidation at an unknown route.
 *
 * Pure and dependency-free: the dispatcher, the receiver route and their tests
 * all import it, and it must stay usable outside a request scope.
 */
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
} from "../data/publicData.cache";
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

/** What one target expires on a receiving deployment. */
export type PublicationEffect = {
  /** Route paths to revalidate, with the segment type Next needs. */
  paths: { path: string; type?: "page" | "layout" }[];
  /** Data cache tags to expire. */
  tags: string[];
};

/** The showcase API feeds every replication carousel, so ordering edits expire it. */
const REPLICATION_SHOWCASE_PATH = "/api/replications/showcase";

/**
 * The single mapping from content identity to cache effect. The editor applies
 * it locally and each public deployment applies it again to the identities it
 * receives, so both ends expire the same things without transmitting tags.
 */
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
      // One long-form article: its own page, the index that lists it, and the
      // locale mirrors of both. The tag is the one every writing read shares.
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
      // One work: its permalink, the per-slug viewer document, the gallery
      // index whose prerendered rails carry its title, and the locale mirrors
      // of all three. The showcase feed and every collection share the
      // corpus tag, so a title edit reaches the carousels too.
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
      // Writing prose is read by list and detail routes alike, so the tag is
      // the whole effect and the route paths follow from it.
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
      // Copy blocks are read by every page, so the tag is the whole effect.
      return { paths: [], tags: [PUBLIC_DATA_CACHE_TAGS.copy] };
    case "banners":
      return { paths: [], tags: [PUBLIC_DATA_CACHE_TAGS.banners] };
    case "home":
      return { paths: [{ path: "/" }], tags: [] };
  }
}

/** Union of the effects of many targets, deduplicated and stably ordered. */
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

/**
 * The saved-path vocabulary the editor already speaks, translated into content
 * identities. `null` means the path is not a known public surface: the local
 * caller keeps its global-expiry escape hatch, while the receiver refuses it.
 */
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
