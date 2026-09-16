import {
  isPublicLocaleCode,
  type TranslationLocaleCode,
} from "../../src/i18n/localeRegistry.mjs";

export const PUBLICATION_SIGNAL_VERSION = 2;

/** A signal older than this is refused: a replayed capture is not a publication. */
export const PUBLICATION_SIGNAL_MAX_SKEW_MS = 300_000;

/** One request carries one editorial operation, never a site-wide sweep. */
export const PUBLICATION_SIGNAL_MAX_TARGETS = 64;

export const PUBLICATION_SIGNAL_MAX_BODY_BYTES = 16_384;

export const PUBLICATION_SIGNATURE_HEADER = "x-dosewiki-publication-signature";

/** The same vocabulary the derived-cache invalidation already speaks. */
export type PublicationSource =
  | "save-article"
  | "proposal-apply"
  | "proposal-revert"
  | "save-quote"
  | "article-publish"
  | "article-restore"
  | "manual"
  | "test-write";

const PUBLICATION_SOURCES: readonly PublicationSource[] = [
  "save-article",
  "proposal-apply",
  "proposal-revert",
  "save-quote",
  "article-publish",
  "article-restore",
  "manual",
  "test-write",
];

/**
 * A public surface a write can affect, named by content identity rather than
 * by cache mechanics. `slug` carries the article, effect, contributor or class
 * key the identity needs; the kinds that address a single fixed surface carry
 * none.
 */
export type ArticlePublicationDependency = "detail" | "content" | "membership";

export type PublicationTarget =
  | {
      kind: "article";
      slug: string;
      /**
       * Omitted by old or detail-less writers on purpose: receivers then take
       * the conservative membership path rather than guessing that an edit
       * was prose-only.
       */
      dependency?: ArticlePublicationDependency;
    }
  | {
      kind: "article-translation";
      slug: string;
      locale: TranslationLocaleCode;
    }
  | { kind: "effect"; slug: string }
  | { kind: "contributor"; slug: string }
  | { kind: "chemical-class"; slug: string }
  | { kind: "molecule"; slug: string }
  | { kind: "report"; slug: string }
  | { kind: "library"; slug: string }
  | { kind: "replication"; slug: string }
  | { kind: "blog-post"; slug: string }
  | { kind: "substance-lists" }
  | { kind: "chemical-lists" }
  | { kind: "mechanism-lists" }
  | { kind: "chemical-class-lists" }
  | { kind: "effect-lists" }
  | { kind: "report-lists" }
  | { kind: "replication-collections" }
  | { kind: "featured-replications" }
  | { kind: "contributor-lists" }
  | { kind: "writing-articles" }
  | { kind: "changelog" }
  | { kind: "about" }
  | { kind: "copy" }
  | { kind: "banners" }
  | { kind: "home" };

export type PublicationSignal = {
  version: typeof PUBLICATION_SIGNAL_VERSION;
  source: PublicationSource;
  /** Editor clock at dispatch, in epoch milliseconds. Bounds replay, not order. */
  issuedAt: number;
  /** Opaque per-dispatch identifier, echoed in the receipt for correlation. */
  dispatchId: string;
  targets: PublicationTarget[];
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
/** Replication slugs keep the underscores of their source-era ids (`?viewer=` accepts the same grammar). */
const REPLICATION_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/;
/** Class depiction keys are stored as `class:<key>` molecule slugs. */
const MOLECULE_SLUG_RE = /^(?:class:)?[a-z0-9][a-z0-9-]{0,127}$/;
const CONTRIBUTOR_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const SLUG_PATTERN_BY_KIND: Partial<Record<PublicationTarget["kind"], RegExp>> =
  {
    article: SLUG_RE,
    "article-translation": SLUG_RE,
    effect: SLUG_RE,
    "chemical-class": SLUG_RE,
    report: SLUG_RE,
    library: SLUG_RE,
    replication: REPLICATION_SLUG_RE,
    "blog-post": SLUG_RE,
    molecule: MOLECULE_SLUG_RE,
    contributor: CONTRIBUTOR_KEY_RE,
  };

const UNKEYED_KINDS: Partial<Record<PublicationTarget["kind"], true>> = {
  "substance-lists": true,
  "chemical-lists": true,
  "mechanism-lists": true,
  "chemical-class-lists": true,
  "effect-lists": true,
  "report-lists": true,
  "replication-collections": true,
  "featured-replications": true,
  "contributor-lists": true,
  "writing-articles": true,
  changelog: true,
  about: true,
  copy: true,
  banners: true,
  home: true,
};
export function isPublicationTarget(
  value: unknown,
): value is PublicationTarget {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    kind?: unknown;
    slug?: unknown;
    dependency?: unknown;
    locale?: unknown;
  };
  if (typeof candidate.kind !== "string") return false;
  if (UNKEYED_KINDS[candidate.kind as PublicationTarget["kind"]] === true) {
    return (
      candidate.slug === undefined &&
      candidate.dependency === undefined &&
      candidate.locale === undefined
    );
  }
  const pattern =
    SLUG_PATTERN_BY_KIND[candidate.kind as PublicationTarget["kind"]];
  if (
    typeof candidate.slug !== "string" ||
    pattern === undefined ||
    !pattern.test(candidate.slug)
  ) {
    return false;
  }
  if (candidate.kind === "article") {
    return (
      candidate.locale === undefined &&
      (candidate.dependency === undefined ||
        candidate.dependency === "detail" ||
        candidate.dependency === "content" ||
        candidate.dependency === "membership")
    );
  }
  if (candidate.kind === "article-translation") {
    const keys = Object.keys(candidate).sort();
    return (
      keys.length === 3 &&
      keys[0] === "kind" &&
      keys[1] === "locale" &&
      keys[2] === "slug" &&
      candidate.dependency === undefined &&
      isPublicLocaleCode(candidate.locale)
    );
  }
  return candidate.dependency === undefined && candidate.locale === undefined;
}

export type PublicationSignalParse =
  | { status: "accepted"; signal: PublicationSignal }
  | { status: "refused"; reason: string };

/**
 * Strict parse of a received body. Anything unrecognized is refused rather
 * than coerced: an unknown target kind on a deployment running older code must
 * not silently expire nothing while reporting success, and must never fall
 * back to expiring the global tag.
 */
export function parsePublicationSignal(
  value: unknown,
  now: number = Date.now(),
): PublicationSignalParse {
  if (!value || typeof value !== "object")
    return { status: "refused", reason: "body_not_object" };
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== PUBLICATION_SIGNAL_VERSION) {
    return { status: "refused", reason: "unsupported_version" };
  }
  if (
    typeof candidate.source !== "string" ||
    !PUBLICATION_SOURCES.includes(candidate.source as PublicationSource)
  ) {
    return { status: "refused", reason: "unknown_source" };
  }
  if (
    typeof candidate.dispatchId !== "string" ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(candidate.dispatchId)
  ) {
    return { status: "refused", reason: "invalid_dispatch_id" };
  }
  if (
    typeof candidate.issuedAt !== "number" ||
    !Number.isFinite(candidate.issuedAt)
  ) {
    return { status: "refused", reason: "invalid_issued_at" };
  }
  if (Math.abs(now - candidate.issuedAt) > PUBLICATION_SIGNAL_MAX_SKEW_MS) {
    return { status: "refused", reason: "stale_signal" };
  }
  if (!Array.isArray(candidate.targets) || candidate.targets.length === 0) {
    return { status: "refused", reason: "no_targets" };
  }
  if (candidate.targets.length > PUBLICATION_SIGNAL_MAX_TARGETS) {
    return { status: "refused", reason: "too_many_targets" };
  }
  for (const target of candidate.targets) {
    if (!isPublicationTarget(target))
      return { status: "refused", reason: "unknown_target" };
  }
  return {
    status: "accepted",
    signal: {
      version: PUBLICATION_SIGNAL_VERSION,
      source: candidate.source as PublicationSource,
      issuedAt: candidate.issuedAt,
      dispatchId: candidate.dispatchId,
      targets: candidate.targets as PublicationTarget[],
    },
  };
}
