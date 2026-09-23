/**
 * The Russian mirror of `/replications/tutorials`, reached only
 * through the middleware rewrite from `ru.dose.wiki/replications/tutorials`.
 * Same tab with its sentences read from the catalog; `noindex` with a
 * canonical link to the English tab.
 */
import {
  getReplicationTutorialsMetadata,
  ReplicationTutorialsRoute,
} from "@/app/replications/(tabs)/_components/ReplicationTutorialsRoute";
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

export function generateMetadata() {
  return getReplicationTutorialsMetadata(LOCALE);
}

export default function LocalizedReplicationTutorialsPage() {
  setRequestLocale(LOCALE.code);
  return <ReplicationTutorialsRoute />;
}
