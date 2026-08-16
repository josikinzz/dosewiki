import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/ui/surface";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { Icon } from "@/components/common/Icon";
import { SiteWordmark } from "@/components/common/SiteWordmark";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata: Metadata = {
  title: `${SITE_FLAVOR_CONFIG.name} is under construction`,
  description: SITE_FLAVOR_CONFIG.underConstruction.description,
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnderConstructionPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell relative isolate grid min-h-screen place-items-center overflow-hidden px-6 py-12 text-center focus:outline-none"
    >
      <div aria-hidden="true" className="theme-home-ambient absolute inset-0 -z-20" />

      <section className="flex w-full max-w-3xl flex-col items-center">
        <DoseWikiLogo
          ariaHidden
          width={160}
          height={160}
          className="theme-home-logo mb-8 h-28 w-28 sm:h-32 sm:w-32 md:h-40 md:w-40"
        />

        <Badge variant="secondary" className="mb-4">
          Public launch in progress
        </Badge>

        <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-none tracking-tight">
          <SiteWordmark />
        </h1>

        <div className="theme-home-construction-banner mt-6 inline-flex items-center gap-3 rounded-3xl border px-5 py-3 font-display">
          <Icon
            icon="lucide:construction"
            size={24}
            className="theme-home-construction-icon"
          />
          <span className="text-sm font-semibold uppercase tracking-[0.22em] sm:text-base">
            Under construction
          </span>
          <Icon
            icon="lucide:triangle-alert"
            size={24}
            className="theme-home-construction-icon theme-home-construction-icon-delay"
          />
        </div>

        <ContentCard className="mt-8 max-w-xl">
          <p className="theme-text-secondary text-base leading-7 sm:text-lg">
            {SITE_FLAVOR_CONFIG.underConstruction.body}
          </p>
        </ContentCard>
      </section>
    </main>
  );
}
