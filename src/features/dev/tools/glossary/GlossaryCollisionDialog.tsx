"use client";

import type { RefObject } from "react";

import { ConfirmDialog } from "@/features/dev/components";
import { kindLabel, languageLabel, type GlossaryReviewCollision } from "./glossaryModel";

type GlossaryCollisionDialogProps = {
  /** The refused write waiting on a decision; `null` keeps the dialog closed. */
  review: { locale: string; error: GlossaryReviewCollision } | null;
  /** Where focus returns once the dialog closes: the control that started the write. */
  returnFocus: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onAllow: () => void;
};

/** Asks before a write lets two English terms share one rendering; nothing is written until "Allow" resends it. */
export function GlossaryCollisionDialog({ review, returnFocus, onCancel, onAllow }: GlossaryCollisionDialogProps) {
  return (
    <ConfirmDialog
      returnFocus={returnFocus}
      onClose={onCancel}
      request={
        review
          ? {
              title: "Allow these terms to share one translation?",
              description: `Nothing was saved yet. These different English terms would read the same in ${languageLabel(review.locale)}. Allow this only when that one translation is right for every term listed.`,
              body: (
                <ul className="theme-text-secondary max-h-64 space-y-4 overflow-y-auto text-sm">
                  {review.error.collisions.map((collision) => (
                    <li key={`${collision.kind}:${collision.target}`} className="space-y-1">
                      <p className="font-medium theme-text-primary">{collision.target}</p>
                      <p>{kindLabel(collision.kind)}</p>
                      <p>{collision.terms.join(", ")}</p>
                    </li>
                  ))}
                </ul>
              ),
              confirmLabel: "Allow shared translation",
              onConfirm: onAllow,
            }
          : null
      }
    />
  );
}
