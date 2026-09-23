"use client";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";

/**
 * The explicit finish pair for a touch editor. Enter and Esc already do this
 * on a keyboard; a touch editor has neither, so these render only where they
 * are the only way to finish the field. Apply is withheld while a conflict
 * panel offers its own two choices.
 */
export function TouchFinishButtons({
  showApply,
  isPending,
  onApply,
  onCancel,
}: {
  showApply: boolean;
  isPending: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {showApply ? (
        <Button
          type="button"
          variant="glass"
          size="quiet"
          className="hidden [@media(pointer:coarse)]:inline-flex"
          disabled={isPending}
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onApply();
          }}
        >
          Apply locally
        </Button>
      ) : null}
      <Button
        type="button"
        variant="pill"
        size="quiet"
        className="hidden [@media(pointer:coarse)]:inline-flex"
        disabled={isPending}
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
      >
        Cancel
      </Button>
    </>
  );
}

/**
 * The recovery panel for a commit refused as stale: the value that landed
 * underneath, and the reviewer's two ways forward.
 *
 * Below the box rather than over it: the reviewer's own text stays the thing
 * in focus, and a phone keyboard is already covering the bottom half of the
 * screen. `asChild` keeps this a `span` so the panel is still valid markup
 * inside an inline field.
 */
export function FieldConflictPanel({
  storedText,
  isPending,
  onApplyMine,
  onUseStored,
}: {
  storedText: string;
  isPending: boolean;
  onApplyMine: () => void;
  onUseStored: () => void;
}) {
  return (
    <Surface
      asChild
      variant="subtle"
      padding="xs"
      radius="md"
      className="mt-2"
    >
      <span className="block">
        <span className="theme-text-faint block text-sm font-semibold">
          Current preview
        </span>
        {/* Capped and scrollable: a long note must not push the two
          choices below the fold on a phone. */}
        <span className="theme-text-secondary mt-1 block max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-snug">
          {storedText.trim() || (
            <span className="theme-text-faint italic">(empty)</span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="glass"
            size="quiet"
            className="h-auto max-w-full whitespace-normal text-left"
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              onApplyMine();
            }}
            disabled={isPending}
          >
            <Icon icon="lucide:check" size={14} />
            Apply my text to preview
          </Button>
          <Button
            type="button"
            variant="pill"
            size="quiet"
            className="h-auto max-w-full whitespace-normal text-left"
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              onUseStored();
            }}
            disabled={isPending}
          >
            <Icon icon="lucide:corner-down-left" size={14} />
            Use current preview text
          </Button>
        </span>
      </span>
    </Surface>
  );
}
