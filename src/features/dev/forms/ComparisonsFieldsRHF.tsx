/**
 * Comparisons: the article's own comparative claims about other substances.
 *
 * The reader prints each substance name followed by its comparison under the
 * Comparisons heading of the subjective-effects section, so the editor keeps
 * that identity instead of two anonymous strings: the compared substance names
 * its own card beside the reader's `git-compare-arrows` mark, and the published
 * shape is stated once rather than guessed from the labels.
 *
 * Removal is the only destructive act here and there is no row-level undo, so
 * the entry list is never the panel's first focusable node (the dialog would
 * otherwise autofocus a delete control), each remove control names the entry it
 * destroys, a populated entry confirms before it goes, and both add and remove
 * report what happened through a live status line.
 */

import { useCallback, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EmptyStateSurface } from "@/components/ui/surface";
import type { SubstanceArticle } from "@/schema";

import { useArticleFormContext } from "./ArticleFormContext";
import { FormEditorField } from "./FormEditorField";
import { EntryCard } from "./EntryCard";
// The nested-effects fields already own this growth behaviour; a comparison is
// the longest prose in this section, so it shares the hook rather than a copy.
import { useGrowToContent } from "./subjective-effects/useGrowToContent";

function entryLabel(drug: string, index: number) {
  return drug || `comparison ${index + 1}`;
}

function ComparisonEntry({
  index,
  onRemove,
}: {
  index: number;
  onRemove: (index: number) => void;
}) {
  const { control, register } = useFormContext<SubstanceArticle>();
  const entry = useWatch({ control, name: `comparisons.${index}` });
  const drug = entry?.drug?.trim() ?? "";
  const incomplete = !drug || !entry?.comparison?.trim();
  const comparisonField = useGrowToContent();
  const {
    ref: registerComparisonRef,
    onChange: onComparisonChange,
    ...comparisonProps
  } = register(`comparisons.${index}.comparison`);

  return (
    <EntryCard
      icon={<Icon icon="lucide:git-compare-arrows" size={16} />}
      title={drug || `Comparison ${index + 1}`}
      bodyClassName="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4"
    >
      <FormEditorField
        name={`comparisons.${index}.drug`}
        label="Compared substance"
        htmlFor={`comparison-drug-${index}`}
        className="min-w-0"
      >
        <Input
          id={`comparison-drug-${index}`}
          placeholder="e.g. 2C-E"
          autoComplete="off"
          {...register(`comparisons.${index}.drug`)}
        />
      </FormEditorField>
      <FormEditorField
        name={`comparisons.${index}.comparison`}
        label="How it compares"
        htmlFor={`comparison-text-${index}`}
        className="col-span-2 min-w-0"
      >
        <Textarea
          id={`comparison-text-${index}`}
          placeholder="e.g. Slower onset and a heavier body load at an equivalent dose."
          className="resize-none"
          {...comparisonProps}
          ref={(element) => {
            registerComparisonRef(element);
            comparisonField.ref(element);
          }}
          onChange={(event) => {
            onComparisonChange(event);
            comparisonField.grow();
          }}
        />
      </FormEditorField>
      {incomplete ? (
        <p className="col-span-2 text-xs text-dose-warning-strong">
          Readers see one line, so a half-finished entry publishes as a bare dash.
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghostDestructive"
        size="auto"
        className={`col-start-2 row-start-1 h-8 w-8 shrink-0 ${TOUCH_ICON}`}
        onClick={() => onRemove(index)}
        title={`Remove ${entryLabel(drug, index)}`}
        aria-label={`Remove ${entryLabel(drug, index)}`}
      >
        <Icon icon="lucide:trash-2" size={16} />
      </Button>
    </EntryCard>
  );
}

export function ComparisonsFieldsRHF() {
  const { comparisons } = useArticleFormContext();
  const { getValues, setFocus } = useFormContext<SubstanceArticle>();
  const addButton = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");
  const count = comparisons.fields.length;

  const handleRemove = useCallback(
    (index: number) => {
      const entry = getValues(`comparisons.${index}`);
      const drug = entry?.drug?.trim() ?? "";
      const label = entryLabel(drug, index);
      const populated = Boolean(drug || entry?.comparison?.trim());
      if (populated && typeof window !== "undefined"
        && !window.confirm(`Remove "${label}"? This cannot be undone.`)) return;
      const remaining = count - 1;
      comparisons.remove(index);
      setStatus(`Removed ${label}. ${remaining === 1 ? "1 comparison remains" : `${remaining} comparisons remain`}.`);
      // The removed row took the focused control with it; land on a real
      // neighbour instead of the dialog container.
      requestAnimationFrame(() => {
        if (remaining > 0) setFocus(`comparisons.${Math.min(index, remaining - 1)}.drug`);
        else addButton.current?.focus();
      });
    },
    [comparisons, count, getValues, setFocus],
  );

  const handleAdd = useCallback(() => {
    const last = count - 1;
    const pending = last >= 0 ? getValues(`comparisons.${last}`) : undefined;
    if (pending && !pending.drug?.trim() && !pending.comparison?.trim()) {
      // Appending onto an untouched row is how blank entries reach readers.
      setStatus(`Comparison ${count} is still empty. Fill it in before adding another.`);
      setFocus(`comparisons.${last}.drug`);
      return;
    }
    // `append`'s own focus lands on the row's last registered control; the
    // substance name is where the entry starts.
    comparisons.append({ drug: "", comparison: "" }, { shouldFocus: false });
    setStatus(`Added comparison ${count + 1}.`);
    requestAnimationFrame(() => setFocus(`comparisons.${count}.drug`));
  }, [comparisons, count, getValues, setFocus]);

  return (
    <section className="space-y-4" aria-label="Comparisons">
      <div className="max-w-[68ch] space-y-1">
        <p className="theme-text-muted text-sm">Comparisons describe this article only. They do not alter the compared substance or create reciprocal relationships.</p>
        <p className="theme-text-faint text-sm">
          Each entry publishes the <span className="theme-text-secondary">substance name followed by its comparison</span>, in the order listed here.
        </p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="theme-text-muted text-sm font-medium leading-5">Comparisons ({count})</p>
        <p role="status" aria-live="polite" className="theme-text-faint text-xs">{status}</p>
      </div>
      {count > 0 ? (
        <div className="space-y-3">
          {comparisons.fields.map((field, index) => (
            <ComparisonEntry key={field.id} index={index} onRemove={handleRemove} />
          ))}
        </div>
      ) : (
        <EmptyStateSurface padding="sm" radius="lg" className="text-sm">
          No comparisons yet. Add one where another substance genuinely clarifies this one for a reader.
        </EmptyStateSurface>
      )}
      <Button
        ref={addButton}
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={handleAdd}
      >
        <Icon icon="lucide:plus" className="h-3.5 w-3.5" size={14} />
        Add comparison
      </Button>
    </section>
  );
}
