import { vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { PublicGalleryReplicationPreview, ReplicationWithUrl } from "../../src/types/replications";
import type { PublicEffectSummary } from "../data/publicData";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

const publicData = vi.hoisted(() => ({
  getEffectArticlesByContributor: vi.fn(() => Promise.resolve([])),
  getPublishedEffectIndexArticles: vi.fn(),
  getPublishedPublicationIndex: vi.fn(),
  getPublicCategoryLayout: vi.fn(),
  getPublicContributorByKey: vi.fn(),
  getPublicContributorIdentity: vi.fn(() => Promise.resolve(null)),
  getPublicContributorDirectory: vi.fn(() => Promise.resolve([])),
  getPublicGalleryReplications: vi.fn(() => Promise.resolve([])),
  getPublicContributorProfiles: vi.fn(() => Promise.resolve([])),
  getPublicContributorIdentities: vi.fn(() => Promise.resolve([])),
  getPublicProfileHistory: vi.fn(() => Promise.resolve([])),
  getPublicDataOverview: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicEffectSummariesBySlugs: vi.fn((_slugs: string[]) => Promise.resolve([] as PublicEffectSummary[])),
  getPublicEffectSlugs: vi.fn(() => Promise.resolve([] as string[])),
  getPublicArtistCreditRows: vi.fn(() => Promise.resolve([])),
  getPublicEffectAudioIndex: vi.fn(() => Promise.resolve([])),
  getPublicEffectContributorCredits: vi.fn(() => Promise.resolve([])),
  getPublicChangelogById: vi.fn(() => Promise.resolve(null)),
  getPublicEffectIndexArticleBySlug: vi.fn(),
  getPublicEffectBySlug: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicEffectIndex: vi.fn(() => Promise.resolve([])),
  getPublicReplicationBySlug: vi.fn(),
  getPublicReplicationIdentityAttribution: vi.fn(() => Promise.resolve(null)),
  getPublicReplications: vi.fn(() => Promise.resolve([])),
  getPublicReplicationsByEffect: vi.fn(() => Promise.resolve([])),
  getPublicReplicationsForSubstance: vi.fn((_substanceSlug: string) =>
    Promise.resolve({ items: [], unmatchedEffectNames: [] }),
  ),
  getPublicReportBySlug: vi.fn(),
  getPublicReportDetailsByContributor: vi.fn(() => Promise.resolve([])),
  getPublicReportsBySubstanceNames: vi.fn(() => Promise.resolve([])),
  getPublicReports: vi.fn(),
  getPublicSubstanceBySlug: vi.fn(),
  getPublicSubstanceLookup: vi.fn(),
  getPublicSubstanceSlugs: vi.fn(() => Promise.resolve([] as string[])),
  getPublicSubstances: vi.fn(() => Promise.resolve([])),
  getReplicationsByContributor: vi.fn(() => Promise.resolve([])),
  getReviewedArticlesByContributor: vi.fn(() => Promise.resolve([])),
  getReportsByContributor: vi.fn(),
}));

const publicLibrary = vi.hoisted(() => ({
  getPublicCategoryDetail: vi.fn(),
  getPublicEffectDetail: vi.fn(),
  getPublicMechanismDetail: vi.fn(),
}));

const reagentData = vi.hoisted(() => ({
  getCachedReagentDataForArticle: vi.fn(() => Promise.resolve(null)),
}));

const publicMolecules = vi.hoisted(() => ({
  getMoleculeUpdatedAt: vi.fn(),
  moleculeOverrideImageUrl: vi.fn(
    (slug: string, updatedAt: string) =>
      `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`,
  ),
}));

const staticParams = vi.hoisted(() => ({
  getStaticEffectCategoryParams: vi.fn(),
}));

/**
 * The canonical banner reads wrap `unstable_cache`, and the localized read
 * composes from that cached result. `unstable_cache` throws
 * "Invariant: incrementalCache missing" outside a Next request context. Mocked
 * like every other data dependency here; the resolver they feed
 * (`resolveEnabledBanners`) is covered directly in
 * `src/data/substanceWarningBanners.test.ts`.
 *
 * The size is the literal 44 rather than `SAFETY_BANNER_ICON_SIZE_DEFAULT`: this
 * factory is hoisted above the import block, so it cannot reference an import.
 */
const warningBanners = vi.hoisted(() => ({
  getWarningBannerPresets: vi.fn(() => Promise.resolve([])),
  getLocalizedWarningBannerPresets: vi.fn(() => Promise.resolve([])),
  getSafetyBannerIconSize: vi.fn(() => Promise.resolve(44)),
}));

vi.mock("@server/data/publicData", () => publicData);
vi.mock("../data/publicData.substances", () => ({
  getPublicSubstanceSlugs: publicData.getPublicSubstanceSlugs,
  getPublicSubstanceSlugsByCandidates: async (candidates: string[]) =>
    (await publicData.getPublicSubstanceSlugs()).filter((slug) => candidates.includes(slug)),
}));
vi.mock("../data/publicData.contributors", () => ({
  getPublicContributorIdentitiesByLookupKeys: publicData.getPublicContributorIdentities,
}));
vi.mock("@server/data/publicLibrary", () => publicLibrary);
vi.mock("@server/data/publicData.molecules", () => publicMolecules);
vi.mock("@server/reagentData", () => reagentData);
vi.mock("./staticParams", () => staticParams);
vi.mock("./warningBanners", () => warningBanners);

vi.mock("@server/next/galleryBrowseIndex", () => ({
  getGalleryBrowseIndex: async () => {
    const [rows, effects, directory] = await Promise.all([
      publicData.getPublicGalleryReplications(), publicData.getPublicEffects(), publicData.getPublicContributorDirectory(),
    ]);
    const canonical = { rows, effects: effects ?? [], directory, translationHashes: [] };
    return { ...canonical, canonical, revision: "route-fixture" };
  },
  hydrateGalleryPage: async (rows: PublicGalleryReplicationPreview[]) => rows,
}));
/**
 * `getCopy` wraps `unstable_cache` for the same reason the banner reads do, so
 * it throws outside a Next request context. Only the Postgres layer is replaced:
 * the resolver still comes from the real `createCopyResolver`, so every key
 * answers with its checked-in default — the same thing a deployment with no
 * `copyBlocks` rows serves.
 */
vi.mock("./copyBlocks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./copyBlocks")>();
  return {
    ...actual,
    getCopy: vi.fn(async () => actual.createCopyResolver([])),
    getCopyByKeys: vi.fn(async () => actual.createCopyResolver([])),
  };
});

export function getRouteLoaderMocks() {
  return { publicData, publicLibrary, publicMolecules, reagentData, staticParams, warningBanners };
}


export function buildContributorProfile(overrides: Partial<NormalizedUserProfile> = {}): NormalizedUserProfile {
  return {
    key: "ADA",
    displayName: "Ada",
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
    ...overrides,
  };
}

export function buildTripReport(overrides: { slug: string; featured?: boolean }) {
  return {
    slug: overrides.slug,
    title: `Report ${overrides.slug}`,
    featured: overrides.featured ?? false,
    subject: { name: "Ada" },
    substances: [],
    onset: [],
    peak: [],
    offset: [],
    tags: [],
  };
}

export function buildReplication(overrides: Partial<ReplicationWithUrl> = {}): ReplicationWithUrl {
  return {
    _id: `id-${overrides.slug ?? "base"}`,
    _creationTime: 0,
    slug: "base",
    title: "Base",
    artist: "Ada",
    type: "image",
    storage_id: "storage-base",
    effect_slug: "tracers",
    format: "webp",
    created_at: "2024-01-01T00:00:00.000Z",
    url: "https://cdn.test/base.webp",
    ...overrides,
  };
}
