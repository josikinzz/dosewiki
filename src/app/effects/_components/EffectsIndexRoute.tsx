import { PrePaintRouteStateCover } from "@/components/common/PrePaintRouteStateCover";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { applyPlaceholders } from "@/data/content/about";
import { t } from "@/i18n/server";
import { msg } from "@/i18n/messages";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";
import { SEI_INTRO_COPY_FALLBACK } from "@/features/effects/components/seiIntroCopy";
import { TABS, type TabId } from "@/features/effects/pages/effectsIndexConfig";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";
import {
  EFFECT_INDEX_DEFAULT_VIEW,
  EFFECT_INDEX_LEGACY_COVER_ID,
  EFFECT_INDEX_VIEW_PARAMS,
  type EffectIndexView,
} from "@/utils/indexViewRoutes";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { getCopyByKeys, getCopyKeysByPrefix, type CopyResolver } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { loadEffectsIndexRoute } from "@server/next/routeLoaders.substances";

const ITEM_LIST_LIMIT = 100;
const EFFECT_INDEX_COPY_KEYS = [
  "seo-effects-index-description",
  ...getCopyKeysByPrefix("effects-index-"),
  ...getCopyKeysByPrefix("empty-effects-"),
];
const LEGACY_HASHES = [
  EFFECT_INDEX_DEFAULT_VIEW,
  ...EFFECT_INDEX_VIEW_PARAMS.map(({ view }) => view),
  "gallery",
];

/**
 * The editable intro blob of one category tab, translated for the request.
 * The copy block's checked-in default is the tab's own blob, so the config
 * text is the fallback only when a block is deleted outright.
 */
function tabBlob(copy: CopyResolver, tabId: TabId): string | undefined {
  const text = copy.text(`effects-index-tab-${tabId}`) || TABS.find((tab) => tab.id === tabId)?.blob;
  return text ? t(text) : undefined;
}

export async function getEffectsIndexMetadata(
  pathname: string,
  options: { noIndex?: boolean; canonicalPathname?: string; locale?: LiveLocale | null } = {},
) {
  const [result, copy] = await Promise.all([loadEffectsIndexRoute(options.locale), getCopyByKeys(EFFECT_INDEX_COPY_KEYS)]);
  const template =
    copy.text("seo-effects-index-description") ||
    msg("Browse {{effectCount}} subjective effect entries in {{siteName}}.");

  return buildPublicPageMetadata({
    ...result.metadata,
    description: applyPlaceholders(t(template, { effectCount: result.pageProps.effects.length, siteName: SITE_FLAVOR_CONFIG.name }), {
      effectCount: result.pageProps.effects.length,
      siteName: SITE_FLAVOR_CONFIG.name,
    }),
    pathname: options.canonicalPathname ?? pathname,
    noIndex: options.noIndex,
    socialImage: pageSocialCardImage(
      "effects",
      `${SITE_FLAVOR_CONFIG.name} Subjective Effect Index`,
    ),
  });
}

export async function EffectsIndexRoute({
  initialView,
  pathname,
  locale = null,
}: {
  initialView: EffectIndexView;
  pathname: string;
  locale?: LiveLocale | null;
}) {
  const [result, copy] = await Promise.all([loadEffectsIndexRoute(locale), getCopyByKeys(EFFECT_INDEX_COPY_KEYS)]);
  const canonicalUrl = buildSiteUrl(pathname);
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: SITE_FLAVOR_CONFIG.organization.subjectiveEffectIndexName,
      description: `Browse ${SITE_FLAVOR_CONFIG.name} subjective effect descriptions and related substance pages.`,
      items: result.pageProps.effects.slice(0, ITEM_LIST_LIMIT).map((effect) => ({
        name: effect.name,
        url: buildSiteUrl(
          getPublicRoutePath({
            family: "effect",
            params: { effectSlug: effect.slug },
          }),
        ),
      })),
    }),
  );

  return (
    <>
      <PrePaintRouteStateCover
        id={EFFECT_INDEX_LEGACY_COVER_ID}
        legacyHashes={LEGACY_HASHES}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <EffectsIndexPage
        {...result.pageProps}
        initialView={initialView}
        emptyState={resolveEmptyStateCopy(copy, "effects", result.pageProps.emptyState)}
        introCopy={{
          lead: t(copy.text("effects-index-intro-lead") || SEI_INTRO_COPY_FALLBACK.lead),
          method: t(copy.text("effects-index-intro-method") || SEI_INTRO_COPY_FALLBACK.method),
          organisation: t(
            copy.text("effects-index-intro-organisation") ||
              SEI_INTRO_COPY_FALLBACK.organisation,
          ),
        }}
        tabBlobs={{
          sensory: tabBlob(copy, "sensory"),
          cognitive: tabBlob(copy, "cognitive"),
          physical: tabBlob(copy, "physical"),
          library: tabBlob(copy, "library"),
        }}
      />
    </>
  );
}
