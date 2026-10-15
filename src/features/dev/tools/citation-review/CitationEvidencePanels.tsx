import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import {
  EditorActionGroup,
  EditorField,
  EditorSelect,
  EditorStatusPill,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import {
  CITATION_REJECT_REASONS,
  CITATION_REJECT_REASON_LABEL,
  CITATION_STATUS_LABEL,
  citationTone,
  formatCitationCount,
  formatCitationRejectReason,
  formatCitationSectionLabel,
  type CitationEvidenceRow as CitationEvidenceRowModel,
  type CitationRejectReason,
  type CitationReviewCommands,
} from "./citationReviewModels";
import {
  CitationUndoBar,
  type CitationEvidenceDecisionHandlers,
  type CitationRejectRequest,
  type CitationUndoOffer,
} from "./CitationReviewPanels";
import { KeyCap } from "./CitationArticlePane";

export type CitationOpenRequest = { claimKey: string; nonce: number };

export function CitationEvidenceSection({
  group,
  commands,
  handlers,
  openedClaimKeys,
  sectionUndo,
  rowUndo,
  rejectRequest,
  openRequest,
  activeClaimKey = null,
  pendingStatus = null,
  onApproveSection,
}: {
  rejectRequest?: CitationRejectRequest | null;
  openRequest?: CitationOpenRequest | null;
  group: { section: string; label: string; rows: CitationEvidenceRowModel[] };
  commands: CitationReviewCommands;
  handlers: CitationEvidenceDecisionHandlers;
  openedClaimKeys: ReadonlySet<string>;
  sectionUndo?: CitationUndoOffer | null;
  rowUndo?: CitationUndoOffer | null;
  activeClaimKey?: string | null;
  pendingStatus?: "approved" | "rejected" | null;
  onApproveSection: (section: string, claimKeys: string[]) => void;
}) {
  const sectionCommand = commands.sections[group.section]?.approve ?? { claimKeys: [], disabled: true };
  const readyCount = sectionCommand.claimKeys.length;
  const openedCount = sectionCommand.claimKeys.filter((claimKey) => openedClaimKeys.has(claimKey)).length;
  const locked = readyCount > 0 && openedCount < readyCount;
  const headingId = useId();
  const reasonId = useId();
  const label = formatCitationSectionLabel(group.section);

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="theme-portal-rule flex items-baseline justify-between gap-3 border-b pb-1.5">
        <h4 id={headingId} className="theme-accent-heading text-base font-semibold">
          {label}
        </h4>
        <p className="theme-text-muted shrink-0 text-xs tabular-nums">
          {formatCitationCount(group.rows.length, "row")}
          {readyCount > 0 ? `, ${readyCount} ready` : ""}
        </p>
      </div>
      {sectionUndo ? <CitationUndoBar offer={sectionUndo} /> : null}
      <ul className="theme-dev-link-list -mx-2.5">
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
            opened={openedClaimKeys.has(row.claimKey)}
            active={activeClaimKey === row.claimKey}
            pendingStatus={pendingStatus}
            undo={rowUndo && rowUndo.decision.prior[0]?.claimKey === row.claimKey ? rowUndo : null}
            rejectRequest={rejectRequest?.claimKey === row.claimKey ? rejectRequest.nonce : undefined}
            openRequest={openRequest?.claimKey === row.claimKey ? openRequest.nonce : undefined}
          />
        ))}
      </ul>
      {readyCount > 1 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sectionCommand.disabled || locked}
            aria-describedby={reasonId}
            onClick={() => onApproveSection(group.section, sectionCommand.claimKeys)}
          >
            <Icon icon="lucide:badge-check" size={14} />
            {`Approve ${readyCount} in ${label}`}
          </Button>
          <p id={reasonId} className="theme-text-muted min-w-0 flex-1 text-xs">
            {locked
              ? `Open each ready row to approve them together (${openedCount} of ${readyCount} opened).`
              : "Asks first."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function formatCitationConfidence(value: number): string {
  const display = value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : `${value}`;
  return `${display} confidence`;
}

const MATCH_WORDS: Record<string, string> = {
  exact: "Exact match in the source",
  normalized_whitespace: "Matched in the source after spacing was normalized",
};

const REJECT_REASON_OPTIONS = CITATION_REJECT_REASONS.map((value) => ({
  value,
  label: CITATION_REJECT_REASON_LABEL[value],
}));

const MAX_REJECT_DETAIL_LENGTH = 500;

function CitationSupportQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="theme-quote-accent-border border-l-2 pl-3 text-sm leading-6 theme-text-primary">
      {children}
    </blockquote>
  );
}

function RowLabel({ children }: { children: ReactNode }) {
  return <p className="theme-text-muted text-xs font-medium">{children}</p>;
}

function CitationRejectForm({
  pending,
  focusOnOpen = false,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const detailRequired = reason === "other";
  const detailMissing = detailRequired && detail.trim().length === 0;

  return (
    <div className="space-y-3 rounded-card border border-[color:var(--theme-danger-border)] px-3 py-3 sm:px-4">
      <p className="theme-text-primary text-sm font-semibold">Reject this row</p>
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
            className="min-h-[72px] resize-y [field-sizing:content] max-h-[40vh]"
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
          size="sm"
          className="rounded-control"
          disabled={detailMissing || pending}
          onClick={() => onConfirm(formatCitationRejectReason(reason, detail))}
        >
          <Icon icon="lucide:x-circle" size={14} />
          {pending ? "Rejecting" : "Reject row"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Keep reviewing
        </Button>
      </EditorActionGroup>
    </div>
  );
}

function approveNote(row: CitationEvidenceRowModel, canApprove: boolean): string {
  if (row.status === "approved") return "Accepted. This quote is part of the article's public evidence.";
  if (!canApprove) {
    return row.status === "needs_source"
      ? "No source was found for this claim, so there is nothing to approve. It stays unmarked until a new research pass finds one."
      : "No verified quote, so this row cannot be approved. Reject it with a reason, or leave it for the next research pass.";
  }
  if (row.status === "rejected") return "Rejected. Approving it now asks first and makes the quote public evidence.";
  return "Approving makes this quote part of the article's public evidence at once.";
}

function CitationEvidenceRow({
  row,
  command,
  handlers,
  undo,
  opened,
  active,
  pendingStatus,
  rejectRequest,
  openRequest,
}: {
  row: CitationEvidenceRowModel;
  command: CitationReviewCommands["rows"][string];
  handlers: CitationEvidenceDecisionHandlers;
  undo: CitationUndoOffer | null;
  opened: boolean;
  active: boolean;
  pendingStatus: "approved" | "rejected" | null;
  rejectRequest?: number;
  openRequest?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [keyboardReject, setKeyboardReject] = useState(false);
  const [seenRejectRequest, setSeenRejectRequest] = useState(rejectRequest);
  const [seenOpenRequest, setSeenOpenRequest] = useState(openRequest);
  const itemRef = useRef<HTMLLIElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [scrollOnOpen, setScrollOnOpen] = useState(false);
  if (rejectRequest !== seenRejectRequest) {
    setSeenRejectRequest(rejectRequest);
    if (rejectRequest !== undefined && !command.rejectDisabled) {
      setExpanded(true);
      setRejecting(true);
      setKeyboardReject(true);
    }
  }
  if (openRequest !== seenOpenRequest) {
    setSeenOpenRequest(openRequest);
    if (openRequest !== undefined) {
      setExpanded(true);
      setScrollOnOpen(true);
    }
  }
  useEffect(() => {
    if (!scrollOnOpen) return;
    setScrollOnOpen(false);
    handlers.onRowExpanded(row.claimKey);
    itemRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    toggleRef.current?.focus({ preventScroll: true });
  }, [handlers, row.claimKey, scrollOnOpen]);

  const referenceIds = [...new Set(row.referenceIds)];
  const supports = row.supports ?? [];
  const supportIds = new Set(supports.map((support) => support.referenceId));
  const otherReferenceIds = referenceIds.filter((id) => !supportIds.has(id));
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
  const previewQuote = supports.find((support) => support.supportingQuote.trim())?.supportingQuote.trim() || legacySnippet;
  const blocking = row.severity === "blocking" && row.status !== "approved";
  const bodyId = useId();
  const errors = (row.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error").length;

  return (
    <li ref={itemRef} role="group" aria-label={`Evidence row: ${claimLabel}`} className="scroll-mt-28">
      <h5 className="text-sm">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => {
            if (expanded) handlers.onRowCollapsed?.(row.claimKey);
            else handlers.onRowExpanded(row.claimKey);
            setExpanded(!expanded);
          }}
          className={cn(
            "theme-dev-link-row flex min-h-11 w-full items-start gap-3 rounded-control px-2.5 py-2.5 text-left",
            expanded && "theme-dev-link-lead",
          )}
        >
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <span className="theme-text-primary min-w-0 font-medium leading-snug">{claimLabel}</span>
              <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                {opened && !expanded ? (
                  <span className="theme-text-faint inline-flex items-center gap-1 text-xs" title="You opened this row">
                    <Icon icon="lucide:eye" size={12} />
                    Opened
                  </span>
                ) : null}
                {blocking ? (
                  <EditorStatusPill inline tone="caution" title="Blocks publication while it is unresolved">
                    Blocking
                  </EditorStatusPill>
                ) : null}
                <EditorStatusPill inline tone={citationTone({ kind: "status", value: row.status })}>
                  {CITATION_STATUS_LABEL[row.status]}
                </EditorStatusPill>
              </span>
            </span>
            {!expanded && previewQuote ? (
              <span className="theme-quote-accent-border theme-text-muted line-clamp-2 block border-l-2 pl-2.5 leading-6">
                {previewQuote}
              </span>
            ) : null}
          </span>
          <ExpandIndicator isExpanded={expanded} className="mt-0.5 shrink-0" />
        </button>
      </h5>

      {undo ? <div className="px-2.5 pb-2"><CitationUndoBar offer={undo} /></div> : null}

      <div id={bodyId} hidden={!expanded} className="space-y-4 px-2.5 pb-4 pt-1">
        {expanded ? (
          <>
            {reviewerNote ? (
              <div className="space-y-1 rounded-card border border-[color:var(--editor-panel-border)] px-3 py-2">
                <RowLabel>{row.status === "rejected" ? "Why it was rejected" : "Reviewer note"}</RowLabel>
                <p className="theme-text-secondary text-sm">{reviewerNote}</p>
              </div>
            ) : null}

            {supports.length > 0 ? (
              <div className="space-y-4">
                {supports.map((support, index) => (
                  <figure key={`${row.claimKey}-${support.referenceId}-${index}`} className="space-y-1.5">
                    <CitationSupportQuote>{support.supportingQuote}</CitationSupportQuote>
                    <figcaption className="theme-text-muted space-y-0.5 pl-3.5 text-xs">
                      <span className="theme-text-secondary block font-medium">{support.sourceName}</span>
                      <span className="block [overflow-wrap:anywhere]">
                        {[
                          support.referenceId,
                          support.sourceType && support.sourceType !== "unknown" ? support.sourceType : null,
                          support.quality ? `${support.quality} quality` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </figcaption>
                    <p className="theme-text-muted flex items-center gap-1.5 pl-3.5 text-xs">
                      <Icon icon="lucide:search-check" size={12} className="theme-success-text-strong shrink-0" />
                      {MATCH_WORDS[support.verifiedQuote?.matchType ?? ""] ?? "Checked against the source"}
                    </p>
                    <p className="theme-text-secondary pl-3.5 text-sm">
                      <span className="theme-text-primary font-medium">Why it supports the claim: </span>
                      {support.rationale}
                    </p>
                  </figure>
                ))}
              </div>
            ) : null}

            {showLegacySnippet ? (
              <div className="space-y-1.5">
                <RowLabel>Snippet from an earlier run, not a verified quote</RowLabel>
                <CitationSupportQuote>{row.supportingSnippet}</CitationSupportQuote>
              </div>
            ) : null}
            {showLegacyRationale ? <p className="theme-text-secondary text-sm">{row.supportRationale}</p> : null}

            {(row.diagnostics?.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                <RowLabel>Checks that flagged this row</RowLabel>
                <ul className="space-y-1.5">
                  {(row.diagnostics ?? []).map((diagnostic, index) => (
                    <li key={`${row.claimKey}-diagnostic-${index}`} className="flex gap-2 text-sm">
                      <Icon
                        icon={diagnostic.severity === "error" ? "lucide:triangle-alert" : "lucide:badge-alert"}
                        size={15}
                        className={cn("mt-0.5 shrink-0", diagnostic.severity === "error" ? "theme-danger-text-strong" : "theme-warning-text-strong")}
                      />
                      <span className="min-w-0">
                        <span className="theme-text-secondary">{diagnostic.message}</span>{" "}
                        <span className="theme-text-faint text-xs">({diagnostic.severity === "error" ? "error" : "warning"}, {diagnostic.code})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {supports.length === 0 && !showLegacySnippet && !reviewerNote ? (
              <p className="theme-text-muted text-sm">No quote was found for this claim.</p>
            ) : null}

            <p className="theme-text-faint text-xs [overflow-wrap:anywhere]">
              {typeof row.confidence === "number" ? `${formatCitationConfidence(row.confidence)} · ` : ""}
              {otherReferenceIds.length > 0 ? `Also cites ${otherReferenceIds.join(", ")} · ` : ""}
              {row.fieldPath ? `${row.fieldPath} · ` : ""}
              {row.claimKey}
            </p>

            {rejecting ? (
              <CitationRejectForm
                pending={command.isPending}
                focusOnOpen={keyboardReject}
                onCancel={() => {
                  setRejecting(false);
                  setKeyboardReject(false);
                }}
                onConfirm={(statusReason) => {
                  setRejecting(false);
                  setKeyboardReject(false);
                  handlers.onReject(row.claimKey, statusReason);
                }}
              />
            ) : (
              <div className="space-y-1.5">
                <EditorActionGroup label="Evidence row decision actions">
                  <Button
                    variant="success"
                    size="sm"
                    disabled={command.approveDisabled}
                    aria-keyshortcuts={active ? "a" : undefined}
                    aria-busy={(command.isPending && pendingStatus === "approved") || undefined}
                    onClick={() => handlers.onApprove([row.claimKey])}
                  >
                    <Icon
                      icon={command.isPending && pendingStatus === "approved" ? "lucide:loader-2" : "lucide:badge-check"}
                      size={14}
                      className={command.isPending && pendingStatus === "approved" ? "motion-safe:animate-spin" : undefined}
                    />
                    {command.isPending && pendingStatus === "approved" ? "Approving" : "Approve"}
                    {active && !command.approveDisabled ? <KeyCap>a</KeyCap> : null}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="theme-danger-text-strong"
                    disabled={command.rejectDisabled}
                    aria-keyshortcuts={active ? "r" : undefined}
                    aria-busy={(command.isPending && pendingStatus === "rejected") || undefined}
                    onClick={() => {
                      setRejecting(true);
                      setKeyboardReject(false);
                    }}
                  >
                    <Icon
                      icon={command.isPending && pendingStatus === "rejected" ? "lucide:loader-2" : "lucide:x-circle"}
                      size={14}
                      className={command.isPending && pendingStatus === "rejected" ? "motion-safe:animate-spin" : undefined}
                    />
                    {command.isPending && pendingStatus === "rejected" ? "Rejecting" : "Reject"}
                    {active && !command.rejectDisabled ? <KeyCap>r</KeyCap> : null}
                  </Button>
                </EditorActionGroup>
                <p className="theme-text-muted text-xs">
                  {approveNote(row, command.canApprove)}
                  {errors > 0 && command.canApprove && row.status !== "approved"
                    ? ` A check flagged ${errors === 1 ? "an error" : `${errors} errors`}, so approving asks first.`
                    : ""}
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </li>
  );
}
