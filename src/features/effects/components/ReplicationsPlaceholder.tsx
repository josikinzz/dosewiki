import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";

/**
 * Placeholder for the replication gallery.
 * Will be replaced with actual gallery implementation later.
 */
export function ReplicationsPlaceholder() {
  return (
    <div className="theme-public-card-subtle rounded-xl border border-dashed p-8 text-center">
      <MediaPlaceholder
        title="Replication Gallery"
        description="Visual and audio replications coming soon."
        className="min-h-40 rounded-lg bg-transparent"
      />
    </div>
  );
}
