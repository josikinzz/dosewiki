/**
 * The Simplified Chinese mirror of the replications section shell, reached
 * only through the middleware rewrite from `zh.dose.wiki/replications*`.
 * Same shared chrome as the English layout, rendered inside the mirror's UI
 * locale so the section title and tab bar read in its language.
 */
import type { ReactNode } from "react";

import ReplicationsSectionLayout from "@/app/replications/(tabs)/layout";
import { UiLocaleProvider } from "@/i18n/client"
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

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
