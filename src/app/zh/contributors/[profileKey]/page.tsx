
import { ContributorRoutePage } from "@/components/pages/ContributorRoutePage";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadContributorIdentityRoute } from "@server/next/routeLoaders.contributors";

export const revalidate = 3600;
export const dynamicParams = true;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type ContributorPageProps = {
  params: Promise<{ profileKey: string }>;
};

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ContributorPageProps) {
  setRequestLocale(LOCALE.code);
  const { profileKey } = await params;
  const result = await loadContributorIdentityRoute(profileKey, LOCALE);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      title: "Contributor",
      description: `Browse contributor profile ${result.normalizedKey}.`,
      route: { family: "contributor", params: { profileKey: result.normalizedKey } },
      noIndex: true,
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
    socialImage: entitySocialCardImage(
      "contributors",
      result.socialCardProfileKey,
      `${result.metadata.title} contributor profile card`,
    ),
  });
}

export default async function ContributorPage({ params }: ContributorPageProps) {
  setRequestLocale(LOCALE.code);
  const { profileKey } = await params;

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ContributorRoutePage profileKey={profileKey} locale={LOCALE} />
      </div>
    </UiLocaleProvider>
  );
}
