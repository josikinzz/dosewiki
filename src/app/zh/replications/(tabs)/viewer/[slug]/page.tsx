/**
 * The Simplified Chinese mirror of `/replications/viewer/[slug]`: the
 * middleware's rewrite target for a `zh.dose.wiki/replications?viewer=<slug>`
 * document request. Same gallery page over the localized corpus with the
 * linked work's social card; `noindex` with a canonical link to the English
 * gallery, like every mirror route.
 */
import { notFound } from "next/navigation";

import { parseReplicationViewerSlug } from "@/features/replications/galleryUrlState";
import {
  getReplicationsGalleryMetadata,
  ReplicationsGalleryRoute,
} from "@/app/replications/(tabs)/_components/ReplicationsGalleryRoute";
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedViewerPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: LocalizedViewerPageProps) {
  const { slug } = await params;
  return getReplicationsGalleryMetadata(
    parseReplicationViewerSlug(new URLSearchParams({ viewer: slug })),
    LOCALE,
  );
}

export default async function LocalizedReplicationViewerPage({ params }: LocalizedViewerPageProps) {
  setRequestLocale(LOCALE.code);
  const { slug } = await params;
  const viewerSlug = parseReplicationViewerSlug(new URLSearchParams({ viewer: slug }));
  if (!viewerSlug) notFound();
  return <ReplicationsGalleryRoute viewerSlug={viewerSlug} locale={LOCALE} />;
}
