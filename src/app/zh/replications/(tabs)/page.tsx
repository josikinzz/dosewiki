/**
 * The Simplified Chinese mirror of `/replications`, reached only through the
 * middleware rewrite from `zh.dose.wiki/replications`. Same gallery page over
 * the localized corpus, so the prerendered rails carry each work's stored
 * title; the mirror carries `noindex` and a canonical link back to the
 * English index.
 */
import {
  getReplicationsGalleryMetadata,
  ReplicationsGalleryRoute,
} from "@/app/replications/(tabs)/_components/ReplicationsGalleryRoute";
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export function generateMetadata() {
  return getReplicationsGalleryMetadata(null, LOCALE);
}

export default function LocalizedReplicationsPage() {
  setRequestLocale(LOCALE.code);
  return <ReplicationsGalleryRoute viewerSlug={null} locale={LOCALE} />;
}
