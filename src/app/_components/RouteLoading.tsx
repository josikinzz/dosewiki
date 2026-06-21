import {
  getRouteLoadingLabel,
  getRouteLoadingModel,
  getSectionLoadingModel,
  type RouteLoadingViewModel,
} from "@server/next/routeLoadingPolicy";
import {
  PublicSkeletonSurface,
  SkeletonPulse,
  SkeletonSection,
} from "@/components/layout/PublicFeedbackPrimitives";

export { getRouteLoadingModel, getSectionLoadingModel };
export { PublicSkeletonSurface, SkeletonPulse, SkeletonSection };

export function RouteLoadingSkeleton({ model }: { model: RouteLoadingViewModel }) {
  return <PublicSkeletonSurface model={model} />;
}

export function RouteLoading({ model, label }: { model?: RouteLoadingViewModel; label?: string }) {
  const resolvedModel = model ?? {
    ...getRouteLoadingModel("page"),
    label: label ?? getRouteLoadingLabel("page"),
  };

  return (
    <section
      id={resolvedModel.landmark.id}
      tabIndex={resolvedModel.landmark.focusTarget ? -1 : undefined}
      className="mx-auto min-h-[50vh] w-full max-w-5xl px-4 py-10 focus:outline-none"
      aria-label={resolvedModel.label}
      aria-busy={resolvedModel.landmark.ariaBusy}
      aria-live={resolvedModel.landmark.ariaLive}
      data-loading-family={resolvedModel.family}
    >
      <RouteLoadingSkeleton model={resolvedModel} />
    </section>
  );
}
