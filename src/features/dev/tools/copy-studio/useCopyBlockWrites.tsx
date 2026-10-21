"use client";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { ConfirmRequest, NoticeMessage } from "@/features/dev/components";
import { submitToolProposal } from "../proposalSubmission";
import { useCopyIndexOperation, type CopyIndexReceipt } from "../useCopyIndexOperation";
import { useCopyIndexSource } from "../useCopyIndexSource";
import type { CopyBlockDocument, CopyBlockRow } from "./copyStudioUtils";

export type CopyBlockSnapshot = { document: CopyBlockRow | null; revision: number };

export function useCopyBlockSource(key: string | null) {
  return useCopyIndexSource<CopyBlockSnapshot>(key ? `/api/dev/copy-block?key=${encodeURIComponent(key)}` : null);
}

export const LOADED_LATEST_NOTICE: NoticeMessage = { tone: "info", message: "Loaded the latest version. Apply your edits again, then publish." };

export function copyConflictNotice(confirm: (request: ConfirmRequest) => void, loadLatest: () => void): NoticeMessage {
  const ask = () => confirm({
    title: "Load the latest version?",
    description: "Your edits here are dropped and the editor shows the block as it is published now. Note anything you want to keep first.",
    confirmLabel: "Load latest",
    destructive: true,
    onConfirm: loadLatest,
  });
  return {
    tone: "danger",
    title: "Someone published this block after you opened it.",
    message: "Your edits are still here. Note what you changed, then load the latest version and apply them again.",
    actions: (
      <Button type="button" variant="outline" size="sm" onClick={ask}>
        Load the latest version
      </Button>
    ),
  };
}

export function proposeCopyBlock(document: CopyBlockDocument, baseline: CopyBlockRow | null, summary: string) {
  return submitToolProposal({
    payload: { copyBlocks: [document] },
    summary,
    baselines: [{ kind: "copyBlock", key: document.key, document: baseline }],
  });
}

export function useCopyBlockWrites() {
  const { serialize, acknowledge, uncertain } = useCopyIndexOperation();
  const send = useCallback(async (method: "POST" | "DELETE", body: object): Promise<CopyIndexReceipt> => {
    const response = await fetch("/api/dev/copy-block", { method, headers: { "Content-Type": "application/json" }, body: serialize(body) });
    return acknowledge(response, await response.json());
  }, [serialize, acknowledge]);
  const publish = useCallback(
    (document: CopyBlockDocument, expected: CopyBlockRow | null, expectedRevision: number) => send("POST", { ...document, expected, expectedRevision }),
    [send],
  );
  const remove = useCallback(
    (key: string, expected: CopyBlockRow | null, expectedRevision: number) => send("DELETE", { key, expected, expectedRevision }),
    [send],
  );
  return { publish, remove, uncertain };
}
