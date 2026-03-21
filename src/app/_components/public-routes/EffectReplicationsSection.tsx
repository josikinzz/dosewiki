import { SectionHeader } from "@/components/common/SectionHeader";
import { ReplicationGallery } from "@/features/effects/components/ReplicationGallery";
import { getPublicReplicationsByEffect } from "@server/convex/publicData";

export async function EffectReplicationsSection({
  effectSlug,
  galleryOrder,
}: {
  effectSlug: string;
  galleryOrder?: string[];
}) {
  const replications = await getPublicReplicationsByEffect(effectSlug);

  return (
    <section id="replications" className="scroll-mt-24 space-y-6">
      <SectionHeader icon="lucide:image" title="Replications" />
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ring-1 ring-white/5 sm:p-6">
        <ReplicationGallery galleryOrder={galleryOrder} replications={replications} />
      </div>
    </section>
  );
}

export function EffectReplicationsSectionFallback() {
  return (
    <section id="replications" className="scroll-mt-24 space-y-6">
      <SectionHeader icon="lucide:image" title="Replications" />
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60 ring-1 ring-white/5 sm:p-6">
        Loading replications…
      </div>
    </section>
  );
}
