/**
 * RHF-based Reagent Testing preview component.
 * Displays read-only reagent data from ProtestKit API.
 * This data is not editable - it's fetched from an external API and cached in articles.json.
 */

import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { useReagentData } from "@/hooks/useReagentData";
import type { SubstanceArticle } from "@/schema";

export type ReagentPreviewFieldsRHFProps = {
  idPrefix: string;
};

export function ReagentPreviewFieldsRHF({ idPrefix: _idPrefix }: ReagentPreviewFieldsRHFProps) {
  const { watch } = useFormContext<SubstanceArticle>();
  
  const substanceName = watch("identification.common_name") || watch("title") || "";
  const aliases = watch("identification.alternative_names") || [];
  
  const { data, isLoading, error, isError } = useReagentData(substanceName, aliases);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-white/60">
          <Icon icon="lucide:pipette" className="h-4 w-4" size={16} />
          <span>Data source: ProtestKit.eu</span>
          <a
            href="https://protestkit.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-fuchsia-400 hover:text-fuchsia-300"
          >
            Visit ProtestKit <Icon icon="lucide:external-link" className="h-3 w-3" size={12} />
          </a>
        </div>

        {!substanceName && (
          <p className="text-sm text-white/50">
            Enter a substance name above to preview reagent data.
          </p>
        )}

        {substanceName && isLoading && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" size={16} />
            <span>Fetching reagent data for "{substanceName}"...</span>
          </div>
        )}

        {substanceName && isError && (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <Icon icon="lucide:alert-circle" className="h-4 w-4" size={16} />
            <span>Failed to fetch reagent data. {error?.message || "API may be unavailable."}</span>
          </div>
        )}

        {substanceName && !isLoading && !isError && !data && (
          <div className="text-sm text-white/50">
            No reagent data found for "{substanceName}" in ProtestKit database.
          </div>
        )}

        {data && data.reagents && data.reagents.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              Found data for: <span className="text-white/70">{data.substance?.name || substanceName}</span>
              {data.substance?.aliases?.length > 0 && (
                <span className="ml-2 text-white/40">
                  (aliases: {data.substance.aliases.slice(0, 3).join(", ")})
                </span>
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.reagents.map((reagent) => {
                // Format reagent name (e.g., "marq_desc" -> "Marquis")
                const reagentName = reagent.reagent
                  .replace(/_desc$/, "")
                  .replace(/^\w/, (c) => c.toUpperCase());
                
                const colorNames = reagent.colors
                  .map((c) => c.name)
                  .join(" → ");

                return (
                  <div
                    key={reagent.reagent}
                    className="rounded border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div className="text-xs font-medium text-white/70">{reagentName}</div>
                    <div className="text-sm text-white/90">
                      {colorNames || (reagent.isReacting ? "Reacts" : "No reaction")}
                    </div>
                    {reagent.hint && (
                      <div className="mt-1 text-xs text-white/40">{reagent.hint}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
