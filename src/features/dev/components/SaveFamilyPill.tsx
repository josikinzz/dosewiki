"use client";

import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";

export type SaveFamily = "staged" | "immediate";

/**
 * The save model, said once per tool. Staged tools hold edits in a draft
 * until the editor commits; immediate tools write on Save. The commit card
 * at the foot of a staged tool repeats the verb, never the explanation.
 */
export const SAVE_FAMILY_PILL: Record<
  SaveFamily,
  { label: string; detail: string; icon: string; tone: EditorStatusPillTone }
> = {
  staged: {
    label: "Apply to draft, then commit to production",
    detail: "Edits stay in your draft until you press Commit to production.",
    icon: "lucide:file-pen-line",
    tone: "info",
  },
  immediate: {
    label: "Save writes to production",
    detail: "Each Save goes to the live site right away.",
    icon: "lucide:zap",
    tone: "success",
  },
};

export function SaveFamilyPill({ family, className }: { family: SaveFamily; className?: string }) {
  const pill = SAVE_FAMILY_PILL[family];
  return (
    <EditorStatusPill tone={pill.tone} icon={pill.icon} title={pill.detail} className={className}>
      {pill.label}
    </EditorStatusPill>
  );
}
