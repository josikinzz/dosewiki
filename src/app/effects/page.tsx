import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadEffectsIndexRoute } from "@server/next/routeLoaders.substances";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { getCopy } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import { SEI_INTRO_COPY_FALLBACK } from "@/features/effects/components/seiIntroCopy";
import { applyPlaceholders } from "@/data/content/about";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

export const revalidate = 3600;
const ITEM_LIST_LIMIT = 100;

export async function generateMetadata() {
  const [result, copy] = await Promise.all([loadEffectsIndexRoute(), getCopy()]);

  const template =
    copy.text("seo-effects-index-description") ||
    "Browse {{effectCount}} subjective effect entries in {{siteName}}.";

  return buildPublicPageMetadata({
    ...result.metadata,
    description: applyPlaceholders(template, {
      effectCount: result.pageProps.effects.length,
      siteName: SITE_FLAVOR_CONFIG.name,
    }),
    route: result.canonicalRoute,
    socialImage: pageSocialCardImage("effects", "dose.wiki Subjective Effect Index"),
  });
}

export default async function EffectsPage() {
  const [result, copy] = await Promise.all([loadEffectsIndexRoute(), getCopy()]);
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: SITE_FLAVOR_CONFIG.organization.subjectiveEffectIndexName,
      description: `Browse ${SITE_FLAVOR_CONFIG.name} subjective effect descriptions and related substance pages.`,
      items: result.pageProps.effects.slice(0, ITEM_LIST_LIMIT).map((effect) => ({
        name: effect.name,
        url: buildSiteUrl(getPublicRoutePath({ family: "effect", params: { effectSlug: effect.slug } })),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <EffectsIndexPage
        {...result.pageProps}
        emptyState={resolveEmptyStateCopy(copy, "effects", result.pageProps.emptyState)}
        introCopy={{
          lead: copy.text("effects-index-intro-lead") || SEI_INTRO_COPY_FALLBACK.lead,
          method: copy.text("effects-index-intro-method") || SEI_INTRO_COPY_FALLBACK.method,
          organisation:
            copy.text("effects-index-intro-organisation") ||
            SEI_INTRO_COPY_FALLBACK.organisation,
        }}
        tabBlobs={{
          sensory: copy.text("effects-index-tab-sensory") || undefined,
          cognitive: copy.text("effects-index-tab-cognitive") || undefined,
          physical: copy.text("effects-index-tab-physical") || undefined,
        }}
      />
    </>
  );
}
