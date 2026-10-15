"use client";

import type { RefObject } from "react";

import { ConfirmDialog } from "@/features/dev/components";
import { kindLabel, languageLabel, type GlossaryReviewCollision } from "./glossaryModel";

type GlossaryCollisionDialogProps = {
  review: { locale: string; error: GlossaryReviewCollision } | null;
  returnFocus: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onAllow: () => void;
};

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
                <ul className="theme-text-secondary max-h-64 space-y-3 overflow-y-auto text-sm">
                  {review.error.collisions.map((collision) => (
                    <li key={`${collision.kind}:${collision.target}`}>
                      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1">
                        <dt className="theme-text-muted">Translation</dt>
                        <dd lang={review.locale} dir="auto" className="font-medium theme-text-primary">{collision.target}</dd>
                        <dt className="theme-text-muted">Type</dt>
                        <dd>{kindLabel(collision.kind)}</dd>
                        <dt className="theme-text-muted">Shared by</dt>
                        <dd>{collision.terms.join(", ")}</dd>
                      </dl>
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
