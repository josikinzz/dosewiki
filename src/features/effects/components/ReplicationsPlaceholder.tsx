import { Icon } from "@/components/common/Icon";

/**
 * Placeholder for the replication gallery.
 * Will be replaced with actual gallery implementation later.
 */
export function ReplicationsPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
      <Icon icon="lucide:image" size={32} className="mx-auto mb-3 text-white/30" />
      <h3 className="text-lg font-semibold text-white/70">Replication Gallery</h3>
      <p className="mt-2 text-sm text-white/50">
        Visual and audio replications coming soon.
      </p>
    </div>
  );
}
