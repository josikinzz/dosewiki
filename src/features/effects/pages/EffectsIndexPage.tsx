import Link from "next/link";
import { t } from "@/i18n/server";
import { AppImage } from "@/components/common/AppImage";
import { PageHeader } from "@/components/layout/PageHeader";
import { SEIRoadmapNotice } from "@/components/common/SEIRoadmapNotice";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { icons } from "@/utils/iconNames";
import { EffectsIndexExplorer } from "./EffectsIndexExplorer";
import type { SEIIntroCopy } from "../components/seiIntroCopy";
import type { TabId } from "./effectsIndexConfig";
import {
  EFFECT_INDEX_DEFAULT_VIEW,
  type EffectIndexView,
} from "@/utils/indexViewRoutes";

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface EffectsIndexPageProps {
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
  /** Editable intro prose, resolved from the copy blocks on the server. */
  introCopy?: SEIIntroCopy;
  /** Editable per-tab intro blobs, resolved on the server. */
  tabBlobs?: Partial<Record<TabId, string>>;
  /** Server-resolved URL state for the first rendered explorer view. */
  initialView?: EffectIndexView;
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
  introCopy,
  tabBlobs,
  initialView = EFFECT_INDEX_DEFAULT_VIEW,
}: EffectsIndexPageProps) {
  // Translate the plain-string catalog key, but keep the non-breaking-space
  // English title when no translation applies, so the English layout keeps
  // "Effect Index" on one line when the title wraps.
  const seiTitle = t("Subjective Effect Index");
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          // Non-breaking space: "Effect Index" stays on one line when the
          // title wraps, so a phone reads "Subjective / Effect Index".
          title={seiTitle === "Subjective Effect Index" ? "Subjective Effect\u00A0Index" : seiTitle}
          icon={icons.subjectiveEffectIndex}
        />

        <div className="-mt-14 mb-12 flex flex-col items-center gap-2 relative z-10">
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
              {t("created by")}{" "}
              <span className="theme-text-secondary font-semibold underline decoration-dose-divider decoration-1 underline-offset-[3px] transition group-hover:text-dose-accent group-hover:decoration-dose-accent">
                Josie Kins
              </span>
              {t(", 2011")}
            </span>
          </Link>
          <SEIRoadmapNotice shimmer className="text-center" />
        </div>
      </div>

      <EffectsIndexExplorer
        key={initialView}
        initialView={initialView}
        effects={effects}
        effectHrefPrefix={effectHrefPrefix}
        emptyState={emptyState}
        introCopy={introCopy}
        tabBlobs={tabBlobs}
      />
    </main>
  );
}
