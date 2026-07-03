import { SkeletonPulse } from "../_components/RouteLoading";

// Docs pages are fully static (no data fetching), so this fallback only ever
// flashes for a moment during the initial stream. It intentionally omits the
// sr-only status text that RouteLoading renders elsewhere: that text has no
// real "still loading" state to announce here, and it was leaking into raw
// SSR output (and therefore search snippets) for pages that resolve
// instantly anyway.
export default function DocsLoading() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto max-w-4xl space-y-7 px-4 py-10"
    >
      <div className="space-y-4">
        <SkeletonPulse height="h-10" width="w-2/3" tone="strong" />
        <SkeletonPulse width="w-full" />
        <SkeletonPulse width="w-5/6" />
      </div>
    </div>
  );
}
