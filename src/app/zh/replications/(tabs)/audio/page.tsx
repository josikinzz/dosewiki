import {
  getReplicationAudioMetadata,
  ReplicationAudioRoute,
} from "@/app/replications/(tabs)/_components/ReplicationAudioRoute";
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

export function generateMetadata() {
  return getReplicationAudioMetadata(LOCALE);
}

export default function LocalizedReplicationAudioPage() {
  setRequestLocale(LOCALE.code);
  return <ReplicationAudioRoute locale={LOCALE} />;
}
