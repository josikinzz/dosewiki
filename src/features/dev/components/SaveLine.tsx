"use client";

import { EditorStatusPill, type EditorStatusPillTone } from "./EditorToolbar";

/** How a tool's primary action writes; the tab registry declares one per tool. */
export type SaveModel = "record" | "batch" | "instant";

/**
 * Where the signed-in member's save goes: to the live site, to an admin as a
 * proposal, or nowhere because only an admin can save here.
 */
export type SaveDestination = "live" | "proposal" | "read-only";

type SaveLineCopy = { label: string; detail: string; icon: string; tone: EditorStatusPillTone };

/**
 * The save model, said once per tool beside its primary action. Only a write
 * that reaches the live site the moment it happens takes the warning tone; a
 * draft or a working set still waits on a deliberate Publish or Commit.
 */
export const SAVE_LINE_COPY: Record<SaveModel, SaveLineCopy> = {
  record: {
    label: "Save draft stays private. Publish goes live.",
    detail: "Each record keeps its own draft until you press Publish.",
    icon: "lucide:file-pen-line",
    tone: "info",
  },
  batch: {
    label: "Edits collect in your draft. Commit sends them live.",
    detail: "Every edit here joins one working set that goes live together when you commit.",
    icon: "lucide:layers",
    tone: "info",
  },
  instant: {
    label: "Each save goes live right away.",
    detail: "There is no draft here: every save reaches the live site as soon as it lands.",
    icon: "lucide:zap",
    tone: "warning",
  },
};

const PROPOSAL_COPY: SaveLineCopy = {
  label: "Submit for review. An admin publishes approved changes.",
  detail: "Submitting sends a proposal to an admin. Nothing you submit publishes on its own.",
  icon: "lucide:send",
  tone: "info",
};

const READ_ONLY_COPY: SaveLineCopy = {
  label: "View only. An admin publishes here.",
  detail: "Your role can read this tool; saving needs the Admin role.",
  icon: "lucide:eye",
  tone: "neutral",
};

export function saveLineCopy(model: SaveModel, destination: SaveDestination): SaveLineCopy {
  return destination === "proposal" ? PROPOSAL_COPY : destination === "read-only" ? READ_ONLY_COPY : SAVE_LINE_COPY[model];
}

export function SaveLine({
  model,
  destination = "live",
  className,
}: {
  model: SaveModel;
  destination?: SaveDestination;
  className?: string;
}) {
  const copy = saveLineCopy(model, destination);
  return (
    <EditorStatusPill tone={copy.tone} icon={copy.icon} title={copy.detail} className={className}>
      {copy.label}
    </EditorStatusPill>
  );
}
