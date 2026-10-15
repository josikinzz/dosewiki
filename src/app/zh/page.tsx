import { readPublicLanguageDirectory } from "@server/translation/publicGlossary";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { buildHomeQuickLinks } from "../_components/homeQuickLinks";
import { HomeExperience } from "../_components/HomeExperience";
import {
  flavoredCopyKey,
  flavoredCopyText,
  getCopyByKeys,
} from "@server/next/copyBlocks";
import { PUBLIC_SITE, buildSiteAssetUrl, buildSiteUrl } from "@server/next/publicSite";
import { pageSocialCardImage } from "@/data/mappings/pageSocialCardUrl";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  const copy = await getCopyByKeys([flavoredCopyKey("home-hero-tagline")]);
  const description = t(flavoredCopyText(copy, "home-hero-tagline", SITE_FLAVOR_CONFIG.description));
  const socialImage = pageSocialCardImage("home", "dose.wiki home");
  const englishUrl = buildSiteUrl("/");

  return {
    title: SITE_FLAVOR_CONFIG.homeTitle,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: englishUrl },
    ...(socialImage
      ? {
          openGraph: {
            type: "website" as const,
            siteName: PUBLIC_SITE.name,
            title: SITE_FLAVOR_CONFIG.rootMetadata.title,
            description,
            url: englishUrl,
            images: [
              {
                url: buildSiteAssetUrl(socialImage.path),
                width: socialImage.width,
                height: socialImage.height,
                alt: socialImage.alt,
              },
            ],
          },
          twitter: {
            card: "summary" as const,
            title: SITE_FLAVOR_CONFIG.rootMetadata.title,
            description,
            images: [buildSiteAssetUrl(socialImage.path)],
          },
        }
      : {}),
  };
}

export default async function LocalizedHomePage() {
  setRequestLocale(LOCALE.code);
  const copy = await getCopyByKeys([flavoredCopyKey("home-hero-tagline")]);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <HomeExperience
          languages={await readPublicLanguageDirectory()}
          quickLinks={buildHomeQuickLinks().map((link) => ({ ...link, label: t(link.label) }))}
          copy={{
            tagline: t(flavoredCopyText(copy, "home-hero-tagline", SITE_FLAVOR_CONFIG.description)),
          }}
        />
      </div>
    </UiLocaleProvider>
  );
}