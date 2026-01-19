/**
 * AttributionEditor - Edit the attribution section for subjective effects.
 * Contains author, text, and url fields.
 */

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Icon } from "../../../common/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubstanceArticle } from "../../../../schema";

export interface AttributionEditorProps {
  /** Prefix for input IDs */
  idPrefix: string;
}

export function AttributionEditor({ idPrefix }: AttributionEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon icon="lucide:quote" className="h-5 w-5 text-fuchsia-300" size={20} />
          <span className="text-sm font-semibold text-white">Attribution</span>
          <span className="text-xs text-white/40">(optional)</span>
        </div>
        {isExpanded ? (
          <Icon icon="lucide:chevron-down" className="h-4 w-4 text-white/40" size={16} />
        ) : (
          <Icon icon="lucide:chevron-right" className="h-4 w-4 text-white/40" size={16} />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-attribution-author`}>
                Author
              </Label>
              <Input
                id={`${idPrefix}-attribution-author`}
                {...register("subjective_effects.attribution.author")}
                placeholder="e.g., Josie Kins"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-attribution-url`}>
                Source URL
              </Label>
              <Input
                id={`${idPrefix}-attribution-url`}
                {...register("subjective_effects.attribution.url")}
                placeholder="https://..."
                type="url"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-attribution-text`}>
              Attribution Text
            </Label>
            <Input
              id={`${idPrefix}-attribution-text`}
              {...register("subjective_effects.attribution.text")}
              placeholder="Forked from Subjective Effect Documentation by Josie Kins, September 2015."
            />
          </div>
        </div>
      )}
    </div>
  );
}
