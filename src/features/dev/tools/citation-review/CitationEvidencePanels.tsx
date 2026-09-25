import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/common/Icon";
import {
  EditorActionGroup,
  EditorField,
  EditorPanel,
  EditorPanelBody,
  EditorSection,
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
import {
  CITATION_REJECT_REASONS,
  CITATION_REJECT_REASON_LABEL,
  CITATION_SEVERITY_LABEL,
  CITATION_STATUS_LABEL,
  citationTone,
  formatCitationCount,
  formatCitationRejectReason,
  formatCitationSectionLabel,
  type CitationEvidenceRow as CitationEvidenceRowModel,
  type CitationEvidenceStatus,
  type CitationRejectReason,
  type CitationReviewCommands,
} from "./citationReviewModels";
import {
  CitationUndoBar,
  toneIconClass,
  toneTileClass,
  type CitationEvidenceDecisionHandlers,
  type CitationRejectRequest,
  type CitationUndoOffer,
} from "./CitationReviewPanels";


export function CitationEvidenceSection({
  group,
  commands,
  handlers,
  openedClaimKeys,
  sectionUndo,
  rowUndo,
  rejectRequest,
  onApproveSection,
}: {
  /** The `r` key's request to open one row's reject form. */
  rejectRequest?: CitationRejectRequest | null;
  group: { section: string; label: string; rows: CitationEvidenceRowModel[] };
  commands: CitationReviewCommands;
  handlers: CitationEvidenceDecisionHandlers;
  /** Rows the reviewer has opened, so their quote has been read in full. */
  openedClaimKeys: ReadonlySet<string>;
  /** Undo for a decision made on this whole section. */
  sectionUndo?: CitationUndoOffer | null;
  /** Undo for a single-row decision; rendered inside that row. */
  rowUndo?: CitationUndoOffer | null;
  onApproveSection: (section: string, claimKeys: string[]) => void;
}) {
  const sectionCommand = commands.sections[group.section]?.approve ?? { claimKeys: [], disabled: true };
  const readyCount = sectionCommand.claimKeys.length;
  const openedCount = sectionCommand.claimKeys.filter((claimKey) => openedClaimKeys.has(claimKey)).length;
  // Same rule as the article-wide approval: every quote it would publish has
  // been opened first.
  const locked = readyCount > 0 && openedCount < readyCount;
  const rowCount = formatCitationCount(group.rows.length, "evidence row");

  return (
    <EditorSection
      title={formatCitationSectionLabel(group.section)}
      description={
        locked
          ? `${rowCount} for this section. Open each ready row to approve them together (${openedCount} of ${readyCount} opened).`
          : `${rowCount} for this section.`
      }
      actions={(
        <Button
          variant="outline"
          size="pill"
          className="rounded-full"
          disabled={sectionCommand.disabled || locked}
          onClick={() => onApproveSection(group.section, sectionCommand.claimKeys)}
        >
          <Icon icon="lucide:badge-check" size={16} />
          Approve section-ready rows
        </Button>
      )}
    >
      <div className="space-y-3">
        {sectionUndo ? <CitationUndoBar offer={sectionUndo} /> : null}
        {group.rows.map((row) => (
          <CitationEvidenceRow
            key={`${row.section}-${row.claimKey}`}
            row={row}
            command={commands.rows[row.claimKey] ?? {
              canApprove: false,
              isPending: false,
              approveDisabled: true,
              rejectDisabled: true,
            }}
            handlers={handlers}
            undo={rowUndo && rowUndo.decision.prior[0]?.claimKey === row.claimKey ? rowUndo : null}
            rejectRequest={rejectRequest?.claimKey === row.claimKey ? rejectRequest.nonce : undefined}
          />
        ))}
      </div>
    </EditorSection>
  );
}

const UNRESOLVED_CITATION_STATUSES: readonly CitationEvidenceStatus[] = [
  "needs_source",
  "needs_review",
  "rejected",
];

function formatCitationConfidence(value: number): string {
  const display = value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : `${value}`;
  return `${display} confidence`;
}

const REFERENCE_ID_BADGE_CLASS = "max-w-full break-all font-mono normal-case tracking-normal";

const REJECT_REASON_OPTIONS = CITATION_REJECT_REASONS.map((value) => ({
  value,
  label: CITATION_REJECT_REASON_LABEL[value],
}));

const MAX_REJECT_DETAIL_LENGTH = 500;

function CitationSupportQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="theme-quote-accent-border border-l-2 pl-3 text-sm leading-6 theme-text-secondary">
      {children}
    </blockquote>
  );
}

function CitationRejectForm({
  pending,
  focusOnOpen = false,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  /** Opened from the keyboard: the reason control takes focus. */
  focusOnOpen?: boolean;
  onCancel: () => void;
  onConfirm: (statusReason: string | undefined) => void;
}) {
  const [reason, setReason] = useState<CitationRejectReason>("quote_does_not_support_claim");
  const [detail, setDetail] = useState("");
  const reasonId = useId();
  const detailId = useId();
  const reasonRef = useRef<HTMLSelectElement | null>(null);
  useEffect(() => {
    if (focusOnOpen) reasonRef.current?.focus();
    // Only on open; later renders leave focus where the reviewer put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const detailRequired = reason === "other";
  const detailMissing = detailRequired && detail.trim().length === 0;

  return (
    <div className={`mt-4 space-y-3 ${toneTileClass("danger")}`}>
      <EditorField
        id={reasonId}
        label="Why is this row rejected?"
        description="Saved with the row so the next editor sees it."
      >
        {(fieldProps) => (
          <EditorSelect
            {...fieldProps}
            ref={reasonRef}
            selectSize="sm"
            options={REJECT_REASON_OPTIONS}
            value={reason}
            onChange={(event) => setReason(event.target.value as CitationRejectReason)}
          />
        )}
      </EditorField>
      <EditorField
        id={detailId}
        label={detailRequired ? "Reason" : "Detail (optional)"}
        required={detailRequired}
        counter={`${detail.length}/${MAX_REJECT_DETAIL_LENGTH}`}
        error={detailMissing ? "Write the reason before rejecting." : undefined}
      >
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            textareaSize="sm"
            className="min-h-[72px] resize-y"
            value={detail}
            maxLength={MAX_REJECT_DETAIL_LENGTH}
            placeholder="What the next editor should check."
            onChange={(event) => setDetail(event.target.value)}
          />
        )}
      </EditorField>
      <EditorActionGroup label="Reject confirmation actions">
        <Button
          variant="destructivePill"
          size="pill"
          className="rounded-full"
          disabled={detailMissing || pending}
          onClick={() => onConfirm(formatCitationRejectReason(reason, detail))}
        >
          <Icon icon="lucide:x-circle" size={16} />
          Reject row
        </Button>
        <Button variant="quiet" size="quiet" onClick={onCancel} disabled={pending}>
          Keep reviewing
        </Button>
      </EditorActionGroup>
    </div>
  );
}

function CitationEvidenceRow({
  row,
  command,
  handlers,
  undo,
  rejectRequest,
}: {
  row: CitationEvidenceRowModel;
  command: CitationReviewCommands["rows"][string];
  handlers: CitationEvidenceDecisionHandlers;
  undo: CitationUndoOffer | null;
  /** Changes each time the `r` key asks this row for its reject form. */
  rejectRequest?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [keyboardReject, setKeyboardReject] = useState(false);
  const [seenRejectRequest, setSeenRejectRequest] = useState(rejectRequest);
  if (rejectRequest !== seenRejectRequest) {
    setSeenRejectRequest(rejectRequest);
    if (rejectRequest !== undefined && !command.rejectDisabled) {
      setExpanded(true);
      setRejecting(true);
      setKeyboardReject(true);
    }
  }
  const isUnresolved = UNRESOLVED_CITATION_STATUSES.includes(row.status);
  const referenceIds = [...new Set(row.referenceIds)];
  const supports = row.supports ?? [];
  const reviewerNote = row.statusReason?.trim() ?? "";
  const legacySnippet = row.supportingSnippet?.trim() ?? "";
  const showLegacySnippet =
    legacySnippet.length > 0 &&
    !supports.some((support) => support.supportingQuote.trim() === legacySnippet);
  const legacyRationale = row.supportRationale?.trim() ?? "";
  const showLegacyRationale =
    legacyRationale.length > 0 &&
    !supports.some((support) => support.rationale.trim() === legacyRationale);
  const claimLabel = row.claimText?.trim() || row.fieldPath || row.claimKey;
  // The collapsed row previews the quote it rests on, so a scan of the list
  // already shows what each approval would publish.
  const previewQuote = supports.find((support) => support.supportingQuote.trim())?.supportingQuote.trim() || legacySnippet;

  return (
    <EditorPanel variant="inset" role="group" aria-label={`Evidence row: ${claimLabel}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (expanded) handlers.onRowCollapsed?.(row.claimKey);
          else handlers.onRowExpanded(row.claimKey);
          setExpanded(!expanded);
        }}
        className="theme-focus-ring-inset flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <Icon icon="lucide:chevron-right" size={16} className={`theme-text-faint shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium theme-text-primary">{claimLabel}</span>
          {!expanded && previewQuote ? <span className="mt-1 line-clamp-2 block text-sm theme-text-muted">{previewQuote}</span> : null}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {typeof row.confidence === "number" ? <span className="text-xs theme-text-faint">{formatCitationConfidence(row.confidence)}</span> : null}
          {row.severity === "blocking" ? <EditorStatusPill tone={isUnresolved ? citationTone({ kind: "severity", value: row.severity }) : "neutral"} title="Blocks publication if left unresolved">{CITATION_SEVERITY_LABEL[row.severity]}</EditorStatusPill> : null}
          <EditorStatusPill tone={citationTone({ kind: "status", value: row.status })}>{CITATION_STATUS_LABEL[row.status]}</EditorStatusPill>
        </span>
      </button>

      {undo ? <div className="border-t border-[color:var(--editor-panel-border)] px-4 py-3 sm:px-5"><CitationUndoBar offer={undo} /></div> : null}

      {expanded ? (
        <EditorPanelBody className="border-t border-[color:var(--editor-panel-border)]">
          <div className="min-w-0">
            <p className="text-sm font-semibold theme-text-primary">{claimLabel}</p>
            <p className="mt-1 break-all text-xs theme-text-faint">{row.claimKey}{row.fieldPath ? ` · ${row.fieldPath}` : ""}</p>
          </div>
          {reviewerNote ? <div className={`mt-3 ${toneTileClass(citationTone({ kind: "status", value: row.status }))}`}><p className="text-xs font-medium uppercase tracking-[0.2em] theme-text-faint">Reviewer note</p><p className="mt-1 text-sm theme-text-secondary">{reviewerNote}</p></div> : null}
          {referenceIds.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{referenceIds.map((referenceId) => <Badge key={`${row.claimKey}-${referenceId}`} variant="secondary" className={REFERENCE_ID_BADGE_CLASS}>{referenceId}</Badge>)}</div> : null}
          {showLegacySnippet ? <div className="mt-4"><CitationSupportQuote>{row.supportingSnippet}</CitationSupportQuote></div> : null}
          {showLegacyRationale ? <p className="mt-3 text-sm theme-text-muted">{row.supportRationale}</p> : null}
          {supports.length > 0 ? <div className="mt-4 space-y-4">{supports.map((support, index) => <div key={`${row.claimKey}-${support.referenceId}-${index}`} className="space-y-1.5"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium theme-text-primary">{support.sourceName}</p><Badge variant="secondary" className={REFERENCE_ID_BADGE_CLASS}>{support.referenceId}</Badge>{support.sourceType && support.sourceType !== "unknown" ? <Badge variant="secondary">{support.sourceType}</Badge> : null}{support.quality ? <Badge variant="secondary" className="normal-case tracking-normal">Quality: {support.quality}</Badge> : null}</div><CitationSupportQuote>{support.supportingQuote}</CitationSupportQuote><p className="text-sm theme-text-muted">{support.rationale}</p></div>)}</div> : null}
          {(row.diagnostics?.length ?? 0) > 0 ? <div className="mt-4 space-y-2">{(row.diagnostics ?? []).map((diagnostic, index) => { const tone = citationTone({ kind: "diagnostic", value: diagnostic.severity }); return <div key={`${row.claimKey}-diagnostic-${index}`} className={`text-sm theme-text-secondary ${toneTileClass(tone)}`}><div className="flex items-center gap-2"><Icon icon={diagnostic.severity === "error" ? "lucide:triangle-alert" : "lucide:badge-alert"} size={15} className={toneIconClass(tone)} /><span className="font-medium theme-text-primary">{diagnostic.code}</span></div><p className="mt-1">{diagnostic.message}</p></div>; })}</div> : null}
          {rejecting ? <CitationRejectForm pending={command.isPending} focusOnOpen={keyboardReject} onCancel={() => { setRejecting(false); setKeyboardReject(false); }} onConfirm={(statusReason) => { setRejecting(false); setKeyboardReject(false); handlers.onReject(row.claimKey, statusReason); }} /> : <EditorActionGroup label="Evidence row decision actions" className="mt-4"><Button variant="success" size="pill" className="rounded-full" disabled={command.approveDisabled} onClick={() => handlers.onApprove([row.claimKey])}><Icon icon={command.isPending ? "lucide:loader-2" : "lucide:badge-check"} size={16} className={command.isPending ? "animate-spin" : undefined} />Approve</Button><Button variant="destructivePill" size="pill" className="rounded-full" disabled={command.rejectDisabled} onClick={() => { setRejecting(true); setKeyboardReject(false); }}><Icon icon={command.isPending ? "lucide:loader-2" : "lucide:x-circle"} size={16} className={command.isPending ? "animate-spin" : undefined} />Reject</Button></EditorActionGroup>}
        </EditorPanelBody>
      ) : null}
    </EditorPanel>
  );
}
