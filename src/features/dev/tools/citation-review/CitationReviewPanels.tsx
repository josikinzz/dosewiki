import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import {
  formatCitationCount,
  type CitationReviewDecisionRecord,
} from "./citationReviewModels";

/** Row-level decisions raised from an evidence row or a section. */
export type CitationEvidenceDecisionHandlers = {
  /** Approve rows that already carry a verified quote. */
  onApprove: (claimKeys: string[]) => void;
  /** Reject one row with the reviewer's note for the next editor. */
  onReject: (claimKey: string, statusReason: string | undefined) => void;
  /** A row was opened, so its quote has been on screen. */
  onRowExpanded: (claimKey: string) => void;
  /** A row was closed again; the triage keys stop acting on it. */
  onRowCollapsed?: (claimKey: string) => void;
};

/** A request from the `r` key to open the reject form on one row; `nonce` changes per press. */
export type CitationRejectRequest = { claimKey: string; nonce: number };

/** The undo for the last decision, rendered where that decision was made. */
export type CitationUndoOffer = {
  decision: CitationReviewDecisionRecord;
  disabled: boolean;
  onUndo: () => void;
  onKeep: () => void;
};

/**
 * Inline result with Undo, shown inside the row, section or dock the decision
 * came from. It stays until the next decision replaces it or the reviewer
 * dismisses it; there is no timer, so the reviewer can read on first.
 */
export function CitationUndoBar({ offer }: { offer: CitationUndoOffer }) {
  const { decision } = offer;
  const verb = decision.status === "approved" ? "Approved" : "Rejected";
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-[color:var(--theme-success-border)] bg-[var(--theme-success-bg)] px-3 py-2"
    >
      <Icon icon="lucide:circle-check" size={15} className="theme-success-text-strong shrink-0" />
      <p className="min-w-0 flex-1 text-sm theme-text-secondary">
        <span className="font-medium theme-text-primary">
          {verb} {formatCitationCount(decision.prior.length, "row")}
        </span>{" "}
        {decision.status === "approved" ? "Saved to the live article." : "Saved with your reason."} Undo puts each row
        back the way it was.
      </p>
      <span className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={offer.disabled}
          aria-keyshortcuts="u"
          onClick={offer.onUndo}
        >
          <Icon icon="lucide:undo-2" size={14} />
          Undo
          <span aria-hidden className="[@media(pointer:coarse)]:hidden">
            <kbd className="theme-dev-kbd !text-current opacity-70">u</kbd>
          </span>
        </Button>
        <Button variant="ghost" size="sm" onClick={offer.onKeep}>
          Dismiss
        </Button>
      </span>
    </div>
  );
}
