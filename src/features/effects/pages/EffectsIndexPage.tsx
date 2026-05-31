import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { PageHeader } from "@/components/layout/PageHeader";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
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
    <div className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          title="Subjective Effect Index"
          icon="lucide:sparkles"
          showSpotlight={false}
        />

        <div className="-mt-14 mb-12 flex justify-center relative z-10">
          <Link
            href="/contributors/josie"
            className="group flex cursor-pointer items-center gap-2.5 rounded-full bg-white/[0.025] py-1.5 pl-2 pr-4 ring-1 ring-white/10 transition-all hover:bg-white/[0.05] hover:ring-fuchsia-400/25 backdrop-blur-md"
          >
            <AppImage
              src="/profile-avatars/josie/avatar.webp"
              alt="Josie Kins"
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover ring-2 ring-white/10 transition group-hover:ring-fuchsia-400/40"
            />
            <span className="text-xs font-medium text-white/56 transition group-hover:text-white/74">
              created by <span className="font-semibold text-fuchsia-200/90 group-hover:text-fuchsia-100">Josie Kins</span>, 2011
            </span>
          </Link>
        </div>
      </div>

      <EffectsIndexExplorer
        effects={effects}
        effectHrefPrefix={effectHrefPrefix}
        emptyState={emptyState}
      />
    </div>
  );
}
