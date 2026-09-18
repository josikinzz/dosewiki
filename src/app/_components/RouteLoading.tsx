import {
  getRouteLoadingLabel,
  getRouteLoadingModel,
  getSectionLoadingModel,
  type RouteLoadingViewModel,
} from "@server/next/routeLoadingPolicy";
import { PublicSkeletonSurface } from "@/components/layout/PublicFeedbackPrimitives";

export { getSectionLoadingModel };

export function RouteLoadingSkeleton({ model }: { model: RouteLoadingViewModel }) {
  return <PublicSkeletonSurface model={model} />;
}

export function RouteLoading({ model, label }: { model?: RouteLoadingViewModel; label?: string }) {
  const resolvedModel = model ?? {
    ...getRouteLoadingModel("page"),
    label: label ?? getRouteLoadingLabel("page"),
  };

  // A route fallback shorter than the viewport gives the document nothing to
  // scroll, so the browser clamps `scrollY` to 0 and *discards* every wheel
  // delta the reader spends while the real page streams in. Reserving two
  // viewports of runway keeps their scroll real; the article that replaces
  // this is far taller anyway. Section fallbacks sit inside a page that
  // already has height, so they reserve nothing.
  const heightClass = resolvedModel.scope === "route" ? "min-h-[200vh]" : "min-h-[50vh]";

  return (
    <section
      id={resolvedModel.landmark.id}
      tabIndex={resolvedModel.landmark.focusTarget ? -1 : undefined}
      className={`mx-auto ${heightClass} w-full max-w-5xl px-4 py-10 focus:outline-none`}
      data-nosnippet
      aria-label={resolvedModel.label}
      aria-busy={resolvedModel.landmark.ariaBusy}
      aria-live={resolvedModel.landmark.ariaLive}
      data-loading-family={resolvedModel.family}
      data-loading-scope={resolvedModel.scope}
    >
      <RouteLoadingSkeleton model={resolvedModel} />
    </section>
  );
}
