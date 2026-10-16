import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import {
  formatCitationCount,
  type CitationReviewDecisionRecord,
} from "./citationReviewModels";

export type CitationEvidenceDecisionHandlers = {
  onApprove: (claimKeys: string[]) => void;
  onReject: (claimKey: string, statusReason: string | undefined) => void;
  onRowExpanded: (claimKey: string) => void;
  onRowCollapsed?: (claimKey: string) => void;
};

export type CitationRejectRequest = { claimKey: string; nonce: number };

export type CitationUndoOffer = {
  decision: CitationReviewDecisionRecord;
  disabled: boolean;
  onUndo: () => void;
  onKeep: () => void;
};

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
