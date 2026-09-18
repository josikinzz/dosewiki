/**
 * Article-owned reagent results plus the read-only ProtestKit snapshot.
 */

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";

import { useReagentData } from "@/hooks/useReagentData";
import type { SubstanceArticle } from "@/schema";
import { cleanString } from "@/data/builders/contentBuilderShared";
import { slugify } from "@/utils/slug";
import { reagentDataToDisplayEntries } from "@/lib/reagentTesting";

export type ReagentPreviewFieldsRHFProps = {
  idPrefix: string;
};

export function ReagentPreviewFieldsRHF({ idPrefix }: ReagentPreviewFieldsRHFProps) {
  const { control } = useFormContext<SubstanceArticle>();
  const { setValue, watch } = useFormContext<SubstanceArticle>();
  const stored = watch("reagent_testing") ?? {};
  const [newReagent, setNewReagent] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  // Only the reagent lookup identity matters here; watching the whole article
  // would re-render this preview on every keystroke anywhere in the form.
  const [title, commonName] = useWatch({
    control,
    name: ["title", "identification.common_name"] as const,
  });
  const substanceName = cleanString(commonName) ?? cleanString(title) ?? "";
  const lookupSlug = slugify(cleanString(title) ?? "");

  const { data, isLoading, error, isError } = useReagentData(lookupSlug);
  const entries = reagentDataToDisplayEntries(data);

  return (
    <section className="space-y-6">
      <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="theme-text-primary text-base font-semibold">Article results</h3>
        <p className="theme-text-muted text-sm">Article-owned results override the imported display for this substance.</p>
      </div>
      {Object.entries(stored).map(([name, result], index) => (
        <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <EditorField label={name} htmlFor={`${idPrefix}-reagent-result-${index}`} className="min-w-0">
            <Textarea id={`${idPrefix}-reagent-result-${index}`} value={result} onChange={(event) => setValue("reagent_testing", { ...stored, [name]: event.target.value }, { shouldDirty: true })} />
          </EditorField>
          <Button type="button" size="auto" variant="ghost" className={`h-8 w-8 shrink-0 ${TOUCH_ICON}`} title={`Remove ${name}`} aria-label={`Remove ${name}`} onClick={() => {
            const next = { ...stored }; delete next[name]; setValue("reagent_testing", next, { shouldDirty: true });
          }}><Icon icon="lucide:trash-2" size={16} /></Button>
        </div>
      ))}
      <EditorField
        label="New reagent"
        htmlFor={`${idPrefix}-new-reagent`}
        description="Enter a reagent name, for example Marquis, then add its result."
        error={entryError}
        errorLive
      >
        {(field) => <Input {...field} value={newReagent} onChange={(event) => { setNewReagent(event.target.value); setEntryError(null); }} />}
      </EditorField>
      <Button type="button" variant="outline" onClick={() => {
        const name = newReagent.trim();
        if (!name) {
          setEntryError("Enter a reagent name."); return;
        }
        if (Object.keys(stored).some((key) => key.toLowerCase() === name.toLowerCase())) {
          setEntryError(`"${name}" already has a result. Edit that result above or enter a different reagent.`); return;
        }
        if (["__proto__", "constructor", "prototype"].includes(name)) {
          setEntryError("This name is reserved. Enter a reagent name instead."); return;
        }
        setValue("reagent_testing", { ...stored, [name]: "" }, { shouldDirty: true });
        setNewReagent(""); setEntryError(null);
      }}>Add reagent result</Button>
      </div>
      <div className="space-y-3 border-t border-dose-border pt-5">
        <div className="space-y-2">
          <h3 className="theme-text-primary text-base font-semibold">ProtestKit snapshot · read-only</h3>
          <p className="theme-text-muted text-sm">ProtestKit results are externally owned; changing this article does not alter the shared ProtestKit database.</p>
        </div>
      <div className="theme-text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Icon icon="lucide:pipette" className="h-4 w-4" size={16} />
          <span>Data source: ProtestKit.eu</span>
          <a
            href="https://protestkit.eu"
            target="_blank"
            rel="noopener noreferrer"
            className={`theme-link-muted ml-auto inline-flex items-center gap-1 ${TOUCH_PILL}`}
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
            <span>Failed to read reagent data. {error?.message || "The snapshot may be unavailable."}</span>
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
      </div>
    </section>
  );
}
