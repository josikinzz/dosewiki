export const PUBLIC_DATA_CACHE_TAGS = {
  all: "data-public",
  substances: "data-public:substances",
  reagentTests: "data-public:reagent-tests",
  effects: "data-public:effects",
  articles: "data-public:articles",
  blog: "data-public:blog",
  replications: "data-public:replications",
  reports: "data-public:reports",
  contributors: "data-public:contributors",
  changelog: "data-public:changelog",
  featuredReplications: "data-public:featured-replications",
  about: "data-public:about",
  layouts: "data-public:layouts",
  copy: "data-public:copy",
  molecules: "data-public:molecules",
  banners: "data-public:banners",
} as const;

export const publicSubstanceTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.substances}:${slug}`;
export const publicSubstanceGalleryTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.replications}:substance:${slug}`;
export const publicArticleHistoryTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.changelog}:article:${slug}`;
export const publicEffectTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.effects}:${slug}`;
export const publicMoleculeTag = (slug: string) => `${PUBLIC_DATA_CACHE_TAGS.molecules}:${slug}`;
export const PUBLIC_SUBSTANCE_LISTS_TAG = "data-public:substance-lists";
export const PUBLIC_SUBSTANCE_CONTENT_TAG = "data-public:substance-content";
export const PUBLIC_SUBSTANCE_DOCUMENTS_TAG = "data-public:substance-documents";
export const PUBLIC_CHANGELOG_LISTS_TAG = "data-public:changelog-lists";
