import { SectionCard } from "../../common/SectionCard";
import { Badge } from "@/components/ui/badge";

import { viewToHash } from "../../../utils/routing";
import { TAG_FIELD_LABELS } from "../../../utils/data/tagRegistry";
import type { TagDetailPanelProps } from "./types";

export function TagDetailPanel({ selectedUsage }: TagDetailPanelProps) {
  return (
    <SectionCard className="space-y-4 bg-white/[0.03]">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="px-4 py-2 text-base font-semibold">
            {selectedUsage.tag}
          </Badge>
          <span className="text-xs uppercase tracking-[0.28em] text-white/45">
            {TAG_FIELD_LABELS[selectedUsage.field]}
          </span>
        </div>
        <p className="mt-3 text-sm text-white/65">
          Used in <span className="font-semibold text-white/80">{selectedUsage.count}</span> article{selectedUsage.count === 1 ? "" : "s"}.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Affected articles</h3>
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
          {selectedUsage.articleRefs.map((ref) => {
            const label = ref.title?.trim()?.length ? ref.title : `Article ${ref.index + 1}`;
            const identifier = typeof ref.id === "number" ? `#${ref.id}` : `Index ${ref.index + 1}`;
            const href = ref.slug ? viewToHash({ type: "substance", slug: ref.slug }) : undefined;

            if (!href) {
              return (
                <div key={`${ref.index}-${ref.id ?? "no-id"}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span className="truncate text-white/80">{label}</span>
                  <span className="text-xs uppercase tracking-[0.28em] text-white/45">{identifier}</span>
                </div>
              );
            }

            return (
              <a
                key={`${ref.index}-${ref.id ?? "no-id"}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 transition hover:border-fuchsia-400/60 hover:bg-fuchsia-500/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
              >
                <span className="truncate">{label}</span>
                <span className="text-xs uppercase tracking-[0.28em] text-white/55">{identifier}</span>
              </a>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
