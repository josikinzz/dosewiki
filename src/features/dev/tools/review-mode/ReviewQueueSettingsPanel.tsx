"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EditorCheckbox, EditorField, EditorSelect, TagToken } from "@/features/dev/components";
import {
  REVIEW_QUEUE_ORDER_OPTIONS,
  type ReviewQueueOrder,
} from "./reviewQueue";
import type { ReviewSettings, ReviewViewMode } from "./reviewSettings";

interface ReviewQueueSettingsPanelProps {
  order: ReviewQueueOrder;
  statsState: "loading" | "ready" | "fallback";
  groupByCategory: boolean;
  unreviewedOnly: boolean;
  changedSinceReview: boolean;
  changedSinceReviewCount: number;
  inlineEdit: boolean;
  articleLinks: boolean;
  viewMode: ReviewViewMode;
  flagLabels: string[];
  flagSeverity: ReviewSettings["flagSeverity"];
  flagGroupBy: ReviewSettings["flagGroupBy"];
  availableFlagLabels: string[];
  updateSettings: (patch: Partial<ReviewSettings>) => void;
  settingsChanged?: boolean;
  resetSettings?: () => void;
}

const CHECKBOX_ROW = "[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="type-meta-label theme-text-muted mb-2">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ReviewQueueSettingsPanel({
  order,
  statsState,
  groupByCategory,
  unreviewedOnly,
  changedSinceReview,
  changedSinceReviewCount,
  inlineEdit,
  articleLinks,
  viewMode,
  flagLabels,
  flagSeverity,
  flagGroupBy,
  availableFlagLabels,
  updateSettings,
  settingsChanged = false,
  resetSettings,
}: ReviewQueueSettingsPanelProps) {
  const unusedLabels = availableFlagLabels.filter((value) => !flagLabels.includes(value));
  return (
    <div className="space-y-5">
      {settingsChanged && resetSettings ? (
        <div className="flex items-center justify-between gap-3">
          <p className="theme-text-muted text-xs">Some settings are off their defaults.</p>
          <Button type="button" variant="link" size="quiet" className="h-auto p-0" onClick={resetSettings}>
            Reset to defaults
          </Button>
        </div>
      ) : null}

      <Group title="Queue">
        <EditorField
          label="Order"
          htmlFor="review-queue-order"
          tone={order === "sources" && statsState === "fallback" ? "warning" : "default"}
          description={
            order === "sources" && statsState === "fallback"
              ? "Source stats did not load, so the queue orders by bibliography size instead."
              : undefined
          }
        >
          <EditorSelect
            id="review-queue-order"
            selectSize="sm"
            value={order}
            onChange={(event) => updateSettings({ order: event.target.value as ReviewQueueOrder })}
            options={REVIEW_QUEUE_ORDER_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </EditorField>
        <EditorCheckbox
          containerClassName={CHECKBOX_ROW}
          checked={unreviewedOnly}
          onChange={(event) => updateSettings({ unreviewedOnly: event.target.checked })}
          label="Show unreviewed articles only"
          description="The arrows skip reviewed articles. The article list still shows them."
        />
        <EditorCheckbox
          containerClassName={CHECKBOX_ROW}
          checked={changedSinceReview}
          onChange={(event) => updateSettings({ changedSinceReview: event.target.checked })}
          label={`Changed since review only (${changedSinceReviewCount})`}
          description="Articles published after their sign-off. Open one to see what changed."
        />
        <EditorCheckbox
          containerClassName={CHECKBOX_ROW}
          checked={groupByCategory}
          onChange={(event) => updateSettings({ groupByCategory: event.target.checked })}
          label="Group the article list by category"
          description="Psychoactive classes and their chemical-class sections, as the index arranges them. The arrows keep the queue order."
        />
      </Group>

      <Group title="Flags">
        <EditorField label="Flag label" htmlFor="review-flag-label">
          <EditorSelect
            id="review-flag-label"
            selectSize="sm"
            value=""
            disabled={unusedLabels.length === 0}
            onChange={(event) =>
              event.target.value &&
              updateSettings({ flagLabels: [...new Set([...flagLabels, event.target.value])] })
            }
            options={[
              {
                value: "",
                label: unusedLabels.length === 0
                  ? flagLabels.length ? "Every label is chosen" : "No flags yet"
                  : flagLabels.length ? "Add another label" : "All labels",
              },
              ...unusedLabels.map((value) => ({ value, label: value })),
            ]}
          />
        </EditorField>
        {flagLabels.length ? (
          <div role="group" aria-label={`Flag labels shown, ${flagLabels.length}`} className="flex flex-wrap gap-1.5">
            {flagLabels.map((value) => (
              <TagToken
                key={value}
                variant="compact"
                label={value}
                onRemove={() => updateSettings({ flagLabels: flagLabels.filter((label) => label !== value) })}
                removeLabel={`Stop filtering by ${value}`}
              />
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Severity" htmlFor="review-flag-severity">
            <EditorSelect
              id="review-flag-severity"
              selectSize="sm"
              value={flagSeverity ?? ""}
              onChange={(event) =>
                updateSettings({ flagSeverity: (event.target.value || null) as ReviewSettings["flagSeverity"] })
              }
              options={[
                { value: "", label: "All severities" },
                { value: "major", label: "Major" },
                { value: "minor", label: "Minor" },
                { value: "note", label: "Note" },
              ]}
            />
          </EditorField>
          <EditorField label="Group flags by" htmlFor="review-flag-group">
            <EditorSelect
              id="review-flag-group"
              selectSize="sm"
              value={flagGroupBy}
              onChange={(event) => updateSettings({ flagGroupBy: event.target.value as ReviewSettings["flagGroupBy"] })}
              options={[
                { value: "none", label: "No grouping" },
                { value: "severity", label: "Severity" },
                { value: "label", label: "Label" },
              ]}
            />
          </EditorField>
        </div>
      </Group>

      <Group title="Reading">
        <EditorCheckbox
          containerClassName={CHECKBOX_ROW}
          checked={inlineEdit}
          onChange={(event) => updateSettings({ inlineEdit: event.target.checked })}
          label="Edit text inline on the page"
          description={
            viewMode === "webpage"
              ? "Click a highlighted value in the Webpage view to edit it in place. The bar says when it is on."
              : "Applies to the Webpage view."
          }
        />
        <EditorCheckbox
          containerClassName={CHECKBOX_ROW}
          checked={articleLinks}
          onChange={(event) => updateSettings({ articleLinks: event.target.checked })}
          label="Links in the article navigate"
          description="Off by default so a stray tap cannot take you to another page mid-review. Contents jumps always work."
        />
      </Group>
    </div>
  );
}
