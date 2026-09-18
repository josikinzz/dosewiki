/**
 * The Simplified Chinese mirror of `/replications/more-info`, reached only
 * through the middleware rewrite from `zh.dose.wiki/replications/more-info`.
 * Same copy blocks rendered through the catalog; `noindex` with a canonical
 * link to the English tab.
 */
import {
  getReplicationsInfoMetadata,
  ReplicationsInfoRoute,
} from "@/app/replications/(tabs)/_components/ReplicationsInfoRoute";
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export function generateMetadata() {
  return getReplicationsInfoMetadata(LOCALE);
}

export default function LocalizedReplicationsInfoPage() {
  setRequestLocale(LOCALE.code);
  return <ReplicationsInfoRoute />;
}
