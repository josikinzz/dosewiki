import {
  getRouteLoadingLabel,
  getRouteLoadingModel,
  getSectionLoadingModel,
  type RouteLoadingSection,
  type RouteLoadingViewModel,
  type SkeletonBlock,
} from "@server/next/routeLoadingPolicy";
import { cn } from "@/lib/utils";

export { getRouteLoadingModel, getSectionLoadingModel };

function SkeletonPulse({ block }: { block: SkeletonBlock }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-full motion-reduce:animate-none",
        block.height,
        block.width,
        block.tone === "strong" ? "bg-white/8" : "bg-white/6",
      )}
    />
  );
}

function SkeletonSection({ section }: { section: RouteLoadingSection }) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5",
        section.variant === "list" ? "rounded-xl" : undefined,
      )}
      data-loading-section={section.key}
      data-loading-variant={section.variant}
    >
      {section.blocks.map((block, index) => (
        <SkeletonPulse key={`${section.key}-${index}`} block={block} />
      ))}
    </div>
  );
}

export function RouteLoadingSkeleton({ model }: { model: RouteLoadingViewModel }) {
  return (
    <div className={cn("mx-auto max-w-4xl", model.density === "compact" ? "space-y-4" : "space-y-6")}>
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">{model.label}</p>

      {model.headingBlocks.length > 0 ? (
        <div className="space-y-3">
          {model.headingBlocks.map((block, index) => (
            <SkeletonPulse key={`heading-${index}`} block={block} />
          ))}
        </div>
      ) : null}

      <div className={cn("grid gap-4", model.sections.some((section) => section.columns === 2) ? "md:grid-cols-2" : undefined)}>
        {model.sections.map((section) => (
          <SkeletonSection key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}

export function RouteLoading({ model, label }: { model?: RouteLoadingViewModel; label?: string }) {
  const resolvedModel = model ?? {
    ...getRouteLoadingModel("page"),
    label: label ?? getRouteLoadingLabel("page"),
  };

  return (
    <main
      id={resolvedModel.landmark.id}
      tabIndex={resolvedModel.landmark.focusTarget ? -1 : undefined}
      className="mx-auto min-h-[50vh] w-full max-w-5xl px-4 py-10 focus:outline-none"
      aria-busy={resolvedModel.landmark.ariaBusy}
      aria-live={resolvedModel.landmark.ariaLive}
      data-loading-family={resolvedModel.family}
    >
      <RouteLoadingSkeleton model={resolvedModel} />
    </main>
  );
}
