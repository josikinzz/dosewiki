import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { PageHeader } from "@/components/layout/PageHeader";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { icons } from "@/utils/iconNames";
import { EffectsIndexExplorer } from "./EffectsIndexExplorer";

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface EffectsIndexPageProps {
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
}

/**
 * Server shell for the subjective effects index.
 *
 * The tabbed filtering and responsive masonry controls live in
 * EffectsIndexExplorer so the route header and initial data render below a
 * server component boundary.
 */
export function EffectsIndexPage({
  effects,
  effectHrefPrefix,
  emptyState,
}: EffectsIndexPageProps) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          title="Subjective Effect Index"
          icon={icons.subjectiveEffectIndex}
          prominentMobileIcon
          showSpotlight={false}
        />

        <div className="-mt-14 mb-12 flex justify-center relative z-10">
          <Link
            href="/contributors/josie"
            className="group inline-flex items-center gap-2 py-1 transition-colors"
          >
            <AppImage
              src="/profile-avatars/josie/avatar.webp"
              alt="Josie Kins"
              width={22}
              height={22}
              className="h-[22px] w-[22px] rounded-full object-cover opacity-90 transition group-hover:opacity-100"
            />
            <span className="theme-text-faint text-xs transition group-hover:text-dose-text-secondary">
              created by{" "}
              <span className="theme-text-secondary font-semibold underline decoration-dose-divider decoration-1 underline-offset-[3px] transition group-hover:text-dose-accent group-hover:decoration-dose-accent">
                Josie Kins
              </span>
              , 2011
            </span>
          </Link>
        </div>
      </div>

      <EffectsIndexExplorer
        effects={effects}
        effectHrefPrefix={effectHrefPrefix}
        emptyState={emptyState}
      />
    </main>
  );
}
