"use client";

import { type ReactNode } from "react";

import { getArticleValueByPath } from "@/data/schema/fieldPath";
import type { SubstanceArticle } from "@/schema";
import { EditableValue } from "../../../editing";

interface EditableHarmTextProps {
  article: SubstanceArticle;
  /** The one path a write is allowed to land on for this piece of prose. */
  path: string;
  /** What the subsection is about to render, straight off the normalizer. */
  value: string;
  /** Human name for the field, used in the accessible label. */
  label: string;
  as?: "span" | "div";
  className?: string;
  children: ReactNode;
}

/**
 * Inline editing for a harm-potential field, gated on the rendered text
 * actually being the text stored at the canonical path.
 *
 * `normalizeHarmPotential` is a *reconciler*, not a reader: the description
 * under "Psychological" may come from `harm_potential.addiction.psychological
 * .description`, or — on a legacy article — from `harm_potential
 * .addiction_liability`, `harm_potential.risks.psychosis`, or a string
 * `harm_potential.toxicity.ld50`. Only the first of those is the path an inline
 * edit may write. Wiring the field unconditionally would let an editor correct
 * a sentence on screen and have the correction land in a key the page does not
 * read, leaving the visible text unchanged and the article quietly forked.
 *
 * So the affordance appears only when the stored value at the canonical path is
 * strictly the value being rendered. On a modern article that is always true;
 * on a legacy one the text renders plainly and stays read-only until the
 * article is migrated. Outside an editing surface this is a fragment either
 * way, so the public page never sees the difference.
 */
export function EditableHarmText({
  article,
  path,
  value,
  label,
  as = "div",
  className,
  children,
}: EditableHarmTextProps) {
  if (getArticleValueByPath(article, path) !== value) {
    return <>{children}</>;
  }

  return (
    <EditableValue as={as} className={className} label={label} path={path} value={value}>
      {children}
    </EditableValue>
  );
}
