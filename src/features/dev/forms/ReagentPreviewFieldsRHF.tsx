/**
 * RHF-based Reagent Testing preview component.
 * Displays read-only reagent data from ProtestKit API.
 * This data is not editable - it's fetched from an external API and cached in SubstanceIndex.json.
 */

import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";

import { useReagentData } from "@/hooks/useReagentData";
import type { SubstanceArticle } from "@/schema";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { reagentDataToDisplayEntries } from "@/lib/reagentTesting";

export type ReagentPreviewFieldsRHFProps = {
  idPrefix: string;
};

export function ReagentPreviewFieldsRHF({ idPrefix: _idPrefix }: ReagentPreviewFieldsRHFProps) {
  const { watch } = useFormContext<SubstanceArticle>();
  const article = watch();
  const chemistryPresentation = buildArticleChemistryPresentation(article);
  const { reagentTesting } = chemistryPresentation;
  const substanceName = reagentTesting.lookupName;
  const aliases = reagentTesting.aliases;
  
  const { data, isLoading, error, isError } = useReagentData(substanceName, aliases);
  const entries = reagentDataToDisplayEntries(data);

  return (
    <section className="space-y-4">
      <div className="theme-text-muted flex items-center gap-2 text-sm">
          <Icon icon="lucide:pipette" className="h-4 w-4" size={16} />
          <span>Data source: ProtestKit.eu</span>
          <a
            href="https://protestkit.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="theme-link-muted ml-auto inline-flex items-center gap-1"
          >
            Visit ProtestKit <Icon icon="lucide:external-link" className="h-3 w-3" size={12} />
          </a>
        </div>

        {!substanceName && (
          <p className="theme-text-faint text-sm">
            Enter a substance name above to preview reagent data.
          </p>
        )}

        {substanceName && isLoading && (
          <div className="theme-text-muted flex items-center gap-2 text-sm">
            <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin" size={16} />
            <span>Fetching reagent data for "{substanceName}"...</span>
          </div>
        )}

        {substanceName && isError && (
          <div className="flex items-center gap-2 text-sm text-[color:var(--theme-warning-text-strong)]">
            <Icon icon="lucide:alert-circle" className="h-4 w-4" size={16} />
            <span>Failed to fetch reagent data. {error?.message || "API may be unavailable."}</span>
          </div>
        )}

        {substanceName && !isLoading && !isError && !data && (
          <div className="theme-text-faint text-sm">
            No reagent data found for "{substanceName}" in ProtestKit database.
          </div>
        )}

        {data && entries.length > 0 && (
          <div className="space-y-3">
            <p className="theme-text-faint text-xs">
              Found data for: <span className="theme-text-secondary">{data.substance?.name || substanceName}</span>
              {data.substance?.aliases?.length > 0 && (
                <span className="theme-text-faint ml-2">
                  (aliases: {data.substance.aliases.slice(0, 3).join(", ")})
                </span>
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <Surface
                  key={entry.key}
                  variant="subtle"
                  padding="none"
                  radius="md"
                  className="px-3 py-2"
                >
                  <div className="theme-text-muted text-xs font-medium">{entry.label}</div>
                  <div className="theme-text-primary text-sm">{entry.description}</div>
                  {entry.hint && (
                    <div className="theme-text-faint mt-1 text-xs">{entry.hint}</div>
                  )}
                </Surface>
              ))}
            </div>
          </div>
        )}
    </section>
  );
}
