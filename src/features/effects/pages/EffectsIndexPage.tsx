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
            className="theme-control-pill-quiet group flex cursor-pointer items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4 ring-1 ring-dose-divider transition-all backdrop-blur-md"
          >
            <AppImage
              src="/profile-avatars/josie/avatar.webp"
              alt="Josie Kins"
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover ring-2 ring-dose-divider transition group-hover:ring-dose-accent"
            />
            <span className="theme-text-faint text-xs font-medium transition group-hover:opacity-90">
              created by <span className="theme-accent-heading font-semibold">Josie Kins</span>, 2011
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
