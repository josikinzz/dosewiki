import { vi } from "vitest";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ReplicationWithUrl } from "../../src/types/replications";

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
  getPublicCategoryLayout: vi.fn(),
  getPublicContributorByKey: vi.fn(),
  getPublicContributorDirectory: vi.fn(() => Promise.resolve([])),
  getPublicGalleryReplications: vi.fn(() => Promise.resolve([])),
  getPublicContributorProfiles: vi.fn(() => Promise.resolve([])),
  getPublicProfileHistory: vi.fn(() => Promise.resolve([])),
  getPublicDataOverview: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicEffectIndexArticleBySlug: vi.fn(),
  getPublicEffectBySlug: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicReplicationBySlug: vi.fn(),
  getPublicReplications: vi.fn(() => Promise.resolve([])),
  getPublicReplicationsByEffect: vi.fn(() => Promise.resolve([])),
  getPublicReplicationsForSubstance: vi.fn((_substanceSlug: string) =>
    Promise.resolve({ items: [], unmatchedEffectNames: [] }),
  ),
  getPublicReportBySlug: vi.fn(),
  getPublicReportsBySubstanceNames: vi.fn(() => Promise.resolve([])),
  getPublicReports: vi.fn(),
  getPublicSubstanceBySlug: vi.fn(),
  getPublicSubstanceLookup: vi.fn(),
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
  getStaticCategoryParams: vi.fn(),
  getStaticEffectCategoryParams: vi.fn(),
  getStaticMechanismParams: vi.fn(),
  getStaticMechanismQualifierParams: vi.fn(),
}));

/**
 * Both banner reads wrap `unstable_cache`, which throws
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
  getSafetyBannerIconSize: vi.fn(() => Promise.resolve(44)),
}));

vi.mock("@server/convex/publicData", () => publicData);
vi.mock("@server/convex/publicLibrary", () => publicLibrary);
vi.mock("@server/convex/publicData.molecules", () => publicMolecules);
vi.mock("@server/reagentData", () => reagentData);
vi.mock("./staticParams", () => staticParams);
vi.mock("./warningBanners", () => warningBanners);
export function getRouteLoaderMocks() {
  return { publicData, publicLibrary, publicMolecules, reagentData, staticParams };
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
