import {
  getReplicationsInfoMetadata,
  ReplicationsInfoRoute,
} from "@/app/replications/(tabs)/_components/ReplicationsInfoRoute";
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

export function generateMetadata() {
  return getReplicationsInfoMetadata(LOCALE);
}

export default function LocalizedReplicationsInfoPage() {
  setRequestLocale(LOCALE.code);
  return <ReplicationsInfoRoute />;
}
