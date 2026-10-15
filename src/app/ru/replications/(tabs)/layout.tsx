import type { ReactNode } from "react";

import ReplicationsSectionLayout from "@/app/replications/(tabs)/layout";
import { UiLocaleProvider } from "@/i18n/client"
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

export default function LocalizedReplicationsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ReplicationsSectionLayout>{children}</ReplicationsSectionLayout>
      </div>
    </UiLocaleProvider>
  );
}
