import { PrePaintRouteStateCover } from "@/components/common/PrePaintRouteStateCover";
import { DosagesPage } from "@/components/pages/DosagesPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { applyPlaceholders } from "@/data/content/about";
import { t } from "@/i18n/server";
import { msg } from "@/i18n/messages";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";
import {
  SUBSTANCE_INDEX_DEFAULT_VIEW,
  SUBSTANCE_INDEX_LEGACY_COVER_ID,
  SUBSTANCE_INDEX_VIEW_PARAMS,
  type SubstanceIndexView,
} from "@/utils/indexViewRoutes";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { getCategoryDefinitions } from "@server/next/categoryDefinitions";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { getPublicSubstanceLookup } from "@server/data/publicData";
import { getSubstancesLayoutRouteOutcome } from "@server/next/publicRouteOutcomes";
import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";

const ITEM_LIST_LIMIT = 100;
const SUBSTANCE_INDEX_COPY_KEYS = [
  "seo-substances-index-description",
  ...getCopyKeysByPrefix("substances-category-"),
];

const LEGACY_HASHES = [
  SUBSTANCE_INDEX_DEFAULT_VIEW,
  ...SUBSTANCE_INDEX_VIEW_PARAMS.map(({ view }) => view),
];
export async function getSubstancesIndexMetadata(
  pathname: string,
  options: { noIndex?: boolean; canonicalPathname?: string } = {},
) {
  const [substances, copy] = await Promise.all([getPublicSubstanceLookup(), getCopyByKeys(SUBSTANCE_INDEX_COPY_KEYS)]);
  const substanceCount = substances.filter((substance) => substance.priority !== "low").length;
  const template =
    copy.text("seo-substances-index-description") ||
    msg(`Browse {{substanceCount}} substance records in {{siteName}}.`);

  return buildPublicPageMetadata({
    title: t(msg("Substance Index")),
    description: applyPlaceholders(t(template, { substanceCount, siteName: SITE_FLAVOR_CONFIG.name }), {
      substanceCount,
      siteName: SITE_FLAVOR_CONFIG.name,
    }),
    pathname: options.canonicalPathname ?? pathname,
    noIndex: options.noIndex,
    socialImage: pageSocialCardImage(
      "substances",
      `${SITE_FLAVOR_CONFIG.name} Substance Index`,
    ),
  });
}

export async function SubstancesIndexRoute({
  initialView,
  pathname,
}: {
  initialView: SubstanceIndexView;
  pathname: string;
}) {
  const [outcome, copy] = await Promise.all([
    getSubstancesLayoutRouteOutcome(),
    getCopyByKeys(SUBSTANCE_INDEX_COPY_KEYS),
  ]);

  if (outcome.state === "unavailable") {
    throw new Error("Public category layout is unavailable.");
  }

  const canonicalUrl = buildSiteUrl(pathname);
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: `${SITE_FLAVOR_CONFIG.name} Substance Index`,
      description: `Browse ${SITE_FLAVOR_CONFIG.name} substance records by psychoactive class, chemical class, and safety context.`,
      items: outcome.substances
        .filter((substance) => substance.priority !== "low")
        .slice(0, ITEM_LIST_LIMIT)
        .map((substance) => ({
          name: substance.name,
          url: buildSiteUrl(
            getPublicRoutePath({
              family: "substance",
              params: { slug: substance.slug },
            }),
          ),
        })),
    }),
  );

  return (
    <>
      <PrePaintRouteStateCover
        id={SUBSTANCE_INDEX_LEGACY_COVER_ID}
        legacyHashes={LEGACY_HASHES}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <DosagesPage
        key={initialView}
        initialView={initialView}
        layout={outcome.layout}
        substances={outcome.substances}
        definitions={getCategoryDefinitions(copy)}
      />
    </>
  );
}
