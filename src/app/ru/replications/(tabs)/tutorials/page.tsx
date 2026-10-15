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
