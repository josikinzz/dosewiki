"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorSelect } from "@/features/dev/components";
import {
  REVIEW_FLAGS_UI,
  REVIEW_QUEUE_ORDER_OPTIONS,
  type ReviewQueueOrder,
} from "./reviewQueue";
import type { ReviewSettings, ReviewViewMode } from "./reviewSettings";

interface ReviewQueueSettingsPanelProps {
  order: ReviewQueueOrder;
  statsState: "loading" | "ready" | "fallback";
  groupByCategory: boolean;
  unreviewedOnly: boolean;
  inlineEdit: boolean;
  articleLinks: boolean;
  viewMode: ReviewViewMode;
  flagLabels: string[];
  flagSeverity: ReviewSettings["flagSeverity"];
  flagGroupBy: ReviewSettings["flagGroupBy"];
  availableFlagLabels: string[];
  updateSettings: (patch: Partial<ReviewSettings>) => void;
}

/**
 * Queue settings shared by the desktop gear popover and mobile overflow sheet.
 */
export function ReviewQueueSettingsPanel({
  order,
  statsState,
  groupByCategory,
  unreviewedOnly,
  inlineEdit,
  articleLinks,
  viewMode,
  flagLabels,
  flagSeverity,
  flagGroupBy,
  availableFlagLabels,
  updateSettings,
}: ReviewQueueSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <label
        htmlFor="review-queue-order"
        className="theme-text-faint block space-y-1.5 text-xs"
      >
        <span className="font-semibold uppercase tracking-[0.12em]">
          Queue order
        </span>
        <EditorSelect
          id="review-queue-order"
          selectSize="sm"
          value={order}
          onChange={(event) =>
            updateSettings({ order: event.target.value as ReviewQueueOrder })
          }
          options={REVIEW_QUEUE_ORDER_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        {order === "sources" && statsState === "fallback" ? (
          <span className="theme-warning-text block text-[11px]">
            Source stats unavailable — ordering by bibliography size instead.
          </span>
        ) : null}
      </label>
      {/* The advisory-flag filters live behind REVIEW_FLAGS_UI with the rest
          of the flag surface — see reviewQueue.ts. */}
      {REVIEW_FLAGS_UI ? (
        <>
          <div className="theme-text-faint space-y-1.5 text-xs">
            <label
              htmlFor="review-flag-label"
              className="block font-semibold uppercase tracking-[0.12em]"
            >
              Flag label
            </label>
            <EditorSelect
              id="review-flag-label"
              value=""
              onChange={(event) =>
                event.target.value &&
                updateSettings({
                  flagLabels: [
                    ...new Set([...flagLabels, event.target.value]),
                  ],
                })
              }
              options={[
                {
                  value: "",
                  label: flagLabels.length
                    ? "Add another label"
                    : "All labels",
                },
                ...availableFlagLabels
                  .filter((value) => !flagLabels.includes(value))
                  .map((value) => ({ value, label: value })),
              ]}
            />
            {flagLabels.length ? (
              <div className="flex flex-wrap gap-1.5">
                {flagLabels.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="chip"
                    size="chip"
                    onClick={() =>
                      updateSettings({
                        flagLabels: flagLabels.filter(
                          (label) => label !== value,
                        ),
                      })
                    }
                  >
                    {value}
                    <Icon icon="lucide:x" size={12} />
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <label
            htmlFor="review-flag-severity"
            className="theme-text-faint block space-y-1.5 text-xs"
          >
            <span className="font-semibold uppercase tracking-[0.12em]">
              Flag severity
            </span>
            <EditorSelect
              id="review-flag-severity"
              value={flagSeverity ?? ""}
              onChange={(event) =>
                updateSettings({
                  flagSeverity: (event.target.value ||
                    null) as ReviewSettings["flagSeverity"],
                })
              }
              options={[
                { value: "", label: "All severities" },
                { value: "major", label: "Major" },
                { value: "minor", label: "Minor" },
                { value: "note", label: "Note" },
              ]}
            />
          </label>
          <label
            htmlFor="review-flag-group"
            className="theme-text-faint block space-y-1.5 text-xs"
          >
            <span className="font-semibold uppercase tracking-[0.12em]">
              Group flags by
            </span>
            <EditorSelect
              id="review-flag-group"
              value={flagGroupBy}
              onChange={(event) =>
                updateSettings({
                  flagGroupBy: event.target
                    .value as ReviewSettings["flagGroupBy"],
                })
              }
              options={[
                { value: "none", label: "Category / flat" },
                { value: "severity", label: "Severity" },
                { value: "label", label: "Label" },
              ]}
            />
          </label>
        </>
      ) : null}
      <div className="space-y-1.5">
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
          <input
            type="checkbox"
            checked={groupByCategory}
            onChange={(event) =>
              updateSettings({ groupByCategory: event.target.checked })
            }
            className="accent-dose-accent-strong"
          />
          Group the article list by category
        </label>
        <span className="theme-text-faint block text-[11px] leading-tight">
          Psychoactive classes and their chemical-class subsections, as the index
          page arranges them. Affects the jump-to list only, not ← / → order.
        </span>
      </div>
      <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
        <input
          type="checkbox"
          checked={unreviewedOnly}
          onChange={(event) =>
            updateSettings({ unreviewedOnly: event.target.checked })
          }
          className="accent-dose-accent-strong"
        />
        Show unreviewed articles only
      </label>
      <div className="space-y-1.5">
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
          <input
            type="checkbox"
            checked={inlineEdit}
            onChange={(event) =>
              updateSettings({ inlineEdit: event.target.checked })
            }
            className="accent-dose-accent-strong"
          />
          Edit text inline on the page
        </label>
        <span className="theme-text-faint block text-[11px] leading-tight">
          {viewMode === "webpage"
            ? "Click any highlighted value in the Webpage view to edit it in place. While it is on, the bar says so."
            : "Applies to the Webpage view."}
        </span>
      </div>
      <div className="space-y-1.5">
        <label className="theme-text-faint flex cursor-pointer items-center gap-2 text-xs [@media(pointer:coarse)]:min-h-11">
          <input
            type="checkbox"
            checked={articleLinks}
            onChange={(event) =>
              updateSettings({ articleLinks: event.target.checked })
            }
            className="accent-dose-accent-strong"
          />
          Links in the article navigate
        </label>
        <span className="theme-text-faint block text-[11px] leading-tight">
          Off by default so a stray tap can&rsquo;t yank you to another page
          mid-review. Table-of-contents jumps always work.
        </span>
      </div>
    </div>
  );
}
