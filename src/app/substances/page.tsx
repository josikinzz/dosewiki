import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { getPublicDataOverview } from "@server/convex/publicData";
import { getSubstancesLayoutRouteOutcome } from "@server/next/publicRouteOutcomes";
import { getCategoryDefinitions } from "@server/next/categoryDefinitions";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { DosagesPage } from "@/components/pages/DosagesPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;
const ITEM_LIST_LIMIT = 100;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPublicPageMetadata({
    title: `Substances · ${overview.substanceCount} records`,
    description: `Browse ${overview.substanceCount} substance records in ${SITE_FLAVOR_CONFIG.name}.`,
    route: { family: "substances" },
  });
}

export default async function SubstancesPage() {
  const outcome = await getSubstancesLayoutRouteOutcome();

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
        definitions={getCategoryDefinitions()}
      />
    </>
  );
}
