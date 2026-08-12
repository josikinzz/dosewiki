import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { getPublicDataOverview } from "@server/convex/publicData";
import { getSubstancesLayoutRouteOutcome } from "@server/next/publicRouteOutcomes";
import { getCategoryDefinitions } from "@server/next/categoryDefinitions";
import { getCopy } from "@server/next/copyBlocks";
import { applyPlaceholders } from "@/data/content/about";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { DosagesPage } from "@/components/pages/DosagesPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;
const ITEM_LIST_LIMIT = 100;

export async function generateMetadata() {
  const [overview, copy] = await Promise.all([getPublicDataOverview(), getCopy()]);

  const template =
    copy.text("seo-substances-index-description") ||
    `Browse {{substanceCount}} substance records in {{siteName}}.`;

  return buildPublicPageMetadata({
    title: `Substances · ${overview.substanceCount} records`,
    description: applyPlaceholders(template, {
      substanceCount: overview.substanceCount,
      siteName: SITE_FLAVOR_CONFIG.name,
    }),
    route: { family: "substances" },
  });
}

export default async function SubstancesPage() {
  const [outcome, copy] = await Promise.all([
    getSubstancesLayoutRouteOutcome(),
    getCopy(),
  ]);

  if (outcome.state === "unavailable") {
    throw new Error("Public category layout is unavailable.");
  }

  const canonicalUrl = buildSiteUrl(getPublicRoutePath({ family: "substances" }));
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
          url: buildSiteUrl(getPublicRoutePath({ family: "substance", params: { slug: substance.slug } })),
        })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <DosagesPage
        layout={outcome.layout}
        substances={outcome.substances}
        definitions={getCategoryDefinitions(copy)}
        introTemplate={copy.text("substances-index-intro")}
      />
    </>
  );
}
