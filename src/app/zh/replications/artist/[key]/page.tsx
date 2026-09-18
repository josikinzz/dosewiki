/**
 * The Simplified Chinese mirror of `/replications/artist/[key]`, reached only
 * through the middleware rewrite from `zh.dose.wiki/replications/artist/<key>`.
 * Same artist page over the localized corpus, so each work's stored title and
 * effect name read in the mirror's language; the artist's own name, links and
 * bio stay as written. `noindex` with a canonical link to the English page.
 */
import type { Metadata } from "next";

import {
  getReplicationArtistMetadata,
  ReplicationArtistRoute,
} from "@/app/replications/artist/[key]/_components/ReplicationArtistRoute";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedArtistPageProps = {
  params: Promise<{ key: string }>;
};

export async function generateMetadata({ params }: LocalizedArtistPageProps): Promise<Metadata> {
  const { key } = await params;
  return getReplicationArtistMetadata(key, LOCALE);
}

export default async function LocalizedReplicationArtistPage({ params }: LocalizedArtistPageProps) {
  setRequestLocale(LOCALE.code);
  const { key } = await params;
  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ReplicationArtistRoute artistKey={key} locale={LOCALE} />
      </div>
    </UiLocaleProvider>
  );
}
