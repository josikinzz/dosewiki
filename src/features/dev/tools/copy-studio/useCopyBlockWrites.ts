"use client";
import { useCallback } from "react";
import { submitToolProposal } from "../proposalSubmission";
import { useCopyIndexOperation, type CopyIndexReceipt } from "../useCopyIndexOperation";
import type { CopyBlockDocument, CopyBlockRow } from "./copyStudioUtils";

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
