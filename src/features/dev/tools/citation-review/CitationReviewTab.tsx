"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { Icon } from "@/components/common/Icon";
import { SmartLink } from "@/components/common/SmartLink";
import {
  LoadErrorState,
  useConfirm,
  useDevShortcuts,
  useScrollToDetail,
  useTriageShortcuts,
  useWriteFreeze,
  type NoticeMessage,
} from "@/features/dev/components";
import { useLibrary } from "@/data/SubstanceIndexProvider";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { proposalHoldOf } from "@/features/dev/tools/queue/queueModel";
import { cn } from "@/lib/utils";
import { useDevMode } from "../../context/DevModeContext";
import { EditorCitationDiagnosticsPanel } from "../../forms/EditorCitationDiagnosticsPanel";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";
import {
  CITATION_QUEUE_FILTER_LABEL,
  CITATION_QUEUE_LOAD_CAUSE_LABEL,
  buildCitationReviewChecklist,
  buildCitationReviewCommands,
  formatCitationCount,
  formatCitationSectionLabel,
  groupCitationEvidenceBySection,
  type CitationEvidenceRow,
  type CitationReviewQueueFilter,
  type CitationReviewQueueLoadFailure,
} from "./citationReviewModels";
import {
  CITATION_FREEZE_COPY,
  describeConflict,
  describeEmptyFilter,
  describeListCount,
  describeQueueTotals,
  tallyRows,
} from "./citationPaneModel";
import { CitationQueuePanel, citationQueueMatches } from "./CitationQueuePanel";
import { CitationEvidenceSection, type CitationOpenRequest } from "./CitationEvidencePanels";
import {
  CitationUndoBar,
  type CitationEvidenceDecisionHandlers,
  type CitationRejectRequest,
  type CitationUndoOffer,
} from "./CitationReviewPanels";
import {
  CitationArticlePane,
  CitationPaneSkeleton,
  type CitationPendingAction,
} from "./CitationArticlePane";
import { useCitationReviewData } from "./useCitationReviewData";

type CitationReviewTabProps = {
  initialSlug?: string;
  actorEmail?: string | null;
};

function formatQueueLoadFailure(failure: CitationReviewQueueLoadFailure): string {
  const parts = [failure.error];
  if (failure.cause) {
    parts.push(CITATION_QUEUE_LOAD_CAUSE_LABEL[failure.cause].replace(/\.?$/, "."));
  }
  if (failure.requestId) {
    parts.push(`Request ${failure.requestId}.`);
  }
  parts.push("The Review portal still works while the queue is down.");
  return parts.join(" ");
}

const SHORTCUTS = [
  { keys: "/", label: "Search articles" },
  { keys: "o", label: "Open the next unread ready row" },
];

const OPEN_A_ROW_HINT = "Open an evidence row first: a approves it, r rejects it with a reason. o opens the next unread ready row.";

type RowOrder = { slug: string; keys: string[] };

export function CitationReviewTab({ initialSlug, actorEmail = null }: CitationReviewTabProps) {
  const { articles, articleHydration } = useDevMode();
  const { allSubstanceRecords } = useLibrary();
  const {
    queue,
    queueFilter,
    setQueueFilter,
    queueError,
    initialLoading,
    refreshing,
    selectedSlug,
    setSelectedSlug,
    missingSlug,
    dismissMissing,
    rows,
    detailError,
    isDetailLoading,
    actionFailure,
    dismissActionFailure,
    reportActionFailure,
    pendingClaimKeys,
    pendingStatus,
    isBulkUpdating,
    isUndoing,
    undoableDecision,
    undoLastDecision,
    dismissUndo,
    refreshQueue,
    refreshDetail,
    updateStatuses,
    claims,
    loadClaims,
    writeClaim,
    isFreezeError,
  } = useCitationReviewData(initialSlug);
  const { confirm, dialog } = useConfirm();
  const { frozen } = useWriteFreeze();
  const baseId = useId();
  const listHeadingId = `${baseId}-list`;
  const paneHeadingId = `${baseId}-pane`;
  const searchId = `${baseId}-search`;
  const listRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const paneHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const articleBySlug = useMemo(() => {
    const lookup = new Map<string, (typeof articles)[number]>();
    for (const article of articles) {
      const articleSlug = resolveEditorArticleSlug(article);
      if (articleSlug) {
        lookup.set(articleSlug, article);
      }
    }
    return lookup;
  }, [articles]);

  const articleTitleBySlug = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const record of allSubstanceRecords) {
      lookup.set(record.slug, record.name);
    }
    for (const article of articles) {
      const articleSlug = resolveEditorArticleSlug(article);
      if (!articleSlug) {
        continue;
      }
      lookup.set(articleSlug, article.title || article.identification.common_name || articleSlug);
    }
    return lookup;
  }, [allSubstanceRecords, articles]);
  const titleOf = useCallback((slug: string) => articleTitleBySlug.get(slug) ?? slug, [articleTitleBySlug]);

  const { isArticleHydrated, requestArticle, failedSlugs } = articleHydration;
  useEffect(() => {
    requestArticle(selectedSlug);
  }, [requestArticle, selectedSlug]);

  const selectedArticle =
    selectedSlug && isArticleHydrated(selectedSlug)
      ? articleBySlug.get(selectedSlug) ?? null
      : null;
  const checklist = useMemo(
    () => buildCitationReviewChecklist(selectedArticle, rows),
    [rows, selectedArticle],
  );

  const [rowOrder, setRowOrder] = useState<RowOrder | null>(null);
  const baseGroups = useMemo(() => groupCitationEvidenceBySection(rows), [rows]);
  useEffect(() => {
    if (!selectedSlug || rows.length === 0) return;
    setRowOrder((current) => {
      const keys = baseGroups.flatMap((group) => group.rows.map((row) => row.claimKey));
      if (!current || current.slug !== selectedSlug) return { slug: selectedSlug, keys };
      const known = new Set(current.keys);
      const added = keys.filter((key) => !known.has(key));
      return added.length > 0 ? { slug: current.slug, keys: [...current.keys, ...added] } : current;
    });
  }, [baseGroups, rows.length, selectedSlug]);
  const sectionGroups = useMemo(() => {
    if (!rowOrder || rowOrder.slug !== selectedSlug) return baseGroups;
    const rank = new Map(rowOrder.keys.map((key, index) => [key, index]));
    const at = (row: CitationEvidenceRow) => rank.get(row.claimKey) ?? Number.MAX_SAFE_INTEGER;
    return baseGroups.map((group) => ({ ...group, rows: [...group.rows].sort((left, right) => at(left) - at(right)) }));
  }, [baseGroups, rowOrder, selectedSlug]);
  const orderedRows = useMemo(() => sectionGroups.flatMap((group) => group.rows), [sectionGroups]);

  const commands = useMemo(
    () => buildCitationReviewCommands({ rows, pendingClaimKeys, isBulkUpdating }),
    [isBulkUpdating, pendingClaimKeys, rows],
  );
  const articleTitle = selectedSlug ? titleOf(selectedSlug) : null;
  const tally = selectedSlug && !isDetailLoading && !detailError ? tallyRows(rows) : null;
  const lastChange = rows.reduce<string | null>(
    (latest, row) => (row.updatedAt && (!latest || row.updatedAt > latest) ? row.updatedAt : latest),
    null,
  );

  const [openedBySlug, setOpenedBySlug] = useState<ReadonlyMap<string, ReadonlySet<string>>>(() => new Map());
  const openedClaimKeys = useMemo<ReadonlySet<string>>(
    () => (selectedSlug ? openedBySlug.get(selectedSlug) ?? new Set() : new Set()),
    [openedBySlug, selectedSlug],
  );
  const openedReadyCount = commands.bulkApprove.claimKeys.filter((claimKey) =>
    openedClaimKeys.has(claimKey),
  ).length;
  const nextUnreadKey = orderedRows.find(
    (row) => commands.bulkApprove.claimKeys.includes(row.claimKey) && !openedClaimKeys.has(row.claimKey),
  )?.claimKey ?? null;

  const [bulkOrigin, setBulkOrigin] = useState<string | null>(null);

  const flaggedCount = useCallback(
    (claimKeys: readonly string[]) => {
      const wanted = new Set(claimKeys);
      return rows.filter(
        (row) => wanted.has(row.claimKey) && (row.diagnostics ?? []).some((diagnostic) => diagnostic.severity === "error"),
      ).length;
    },
    [rows],
  );

  const confirmApproval = useCallback(
    (claimKeys: string[], scope: string, origin: string) => {
      const wanted = new Set(claimKeys);
      const countBySection = new Map<string, number>();
      for (const row of rows) {
        if (wanted.has(row.claimKey)) {
          countBySection.set(row.section, (countBySection.get(row.section) ?? 0) + 1);
        }
      }
      const affected = [...countBySection.entries()].map(
        ([section, count]) => `${formatCitationSectionLabel(section)}: ${formatCitationCount(count, "row")}`,
      );
      const flagged = flaggedCount(claimKeys);

      confirm({
        title: `Approve ${formatCitationCount(claimKeys.length, "ready row")} ${scope}?`,
        description:
          "Each approved row becomes part of the public article's evidence. Rows without a verified quote and rejected rows are left alone. You can undo until your next decision." +
          (flagged > 0 ? ` ${flagged === 1 ? "One of them carries" : `${flagged} of them carry`} an error from the checks; open ${flagged === 1 ? "it" : "them"} again if you are unsure.` : ""),
        confirmLabel: `Approve ${formatCitationCount(claimKeys.length, "row")}`,
        affected,
        affectedLabel: `Sections, ${countBySection.size}`,
        onConfirm: () => {
          setBulkOrigin(origin);
          return updateStatuses(claimKeys, "approved");
        },
      });
    },
    [confirm, flaggedCount, rows, updateStatuses],
  );

  const [activeClaim, setActiveClaim] = useState<{ slug: string | null; claimKey: string } | null>(null);
  const activeClaimKey = activeClaim && activeClaim.slug === selectedSlug ? activeClaim.claimKey : null;
  const [rejectRequest, setRejectRequest] = useState<CitationRejectRequest | null>(null);
  const [openRequest, setOpenRequest] = useState<CitationOpenRequest | null>(null);
  const [keyHint, setKeyHint] = useState<string | null>(null);

  const approveRow = useCallback(
    (claimKey: string) => {
      const row = rows.find((entry) => entry.claimKey === claimKey);
      if (!row) return;
      const errors = (row.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error");
      const claim = row.claimText?.trim() || row.fieldPath || row.claimKey;
      if (row.status === "rejected" || errors.length > 0) {
        const note = row.statusReason?.trim();
        confirm({
          title: row.status === "rejected" ? "Approve a rejected row?" : "Approve a row the checks flagged?",
          description:
            (row.status === "rejected"
              ? `“${claim}” was rejected${note ? `: “${note}”` : " without a reason"}. `
              : `The checks flagged “${claim}”: ${errors.map((entry) => entry.message).join(" ")} `) +
            `Approving makes its quote part of ${articleTitle ?? "the article"}'s public evidence at once. You can undo until your next decision.`,
          confirmLabel: "Approve row",
          onConfirm: () => updateStatuses([claimKey], "approved"),
        });
        return;
      }
      void updateStatuses([claimKey], "approved");
    },
    [articleTitle, confirm, rows, updateStatuses],
  );

  const handlers = useMemo<CitationEvidenceDecisionHandlers>(
    () => ({
      onApprove: (claimKeys) => {
        if (claimKeys.length === 1) approveRow(claimKeys[0]);
        else void updateStatuses(claimKeys, "approved");
      },
      onReject: (claimKey, statusReason) => {
        void updateStatuses([claimKey], "rejected", statusReason);
      },
      onRowExpanded: (claimKey) => {
        setActiveClaim({ slug: selectedSlug, claimKey });
        setKeyHint(null);
        if (!selectedSlug) return;
        setOpenedBySlug((current) => {
          const base = current.get(selectedSlug) ?? new Set<string>();
          if (base.has(claimKey)) {
            return current;
          }
          return new Map(current).set(selectedSlug, new Set([...base, claimKey]));
        });
      },
      onRowCollapsed: (claimKey) => {
        setActiveClaim((current) => (current?.claimKey === claimKey ? null : current));
      },
    }),
    [approveRow, selectedSlug, updateStatuses],
  );

  const busy = pendingClaimKeys.length > 0;
  const undoOffer = useMemo<CitationUndoOffer | null>(
    () =>
      undoableDecision
        ? {
            decision: undoableDecision,
            disabled: isBulkUpdating || pendingClaimKeys.length > 0,
            onUndo: () => {
              void undoLastDecision();
            },
            onKeep: dismissUndo,
          }
        : null,
    [dismissUndo, isBulkUpdating, pendingClaimKeys.length, undoLastDecision, undoableDecision],
  );
  const undoOnScreen = undoOffer && undoOffer.decision.slug === selectedSlug ? undoOffer : null;
  const isSingleRowUndo = undoOnScreen !== null && undoOnScreen.decision.prior.length === 1;
  const rowUndo = isSingleRowUndo ? undoOnScreen : null;
  const setUndo = undoOnScreen && !isSingleRowUndo ? undoOnScreen : null;
  const sectionOrigin = setUndo && bulkOrigin !== null && sectionGroups.some((group) => group.section === bulkOrigin);
  const articleUndo = setUndo && !sectionOrigin ? setUndo : null;
  const offscreenUndo = undoOffer && !undoOnScreen ? undoOffer : null;

  const [queueQuery, setQueueQuery] = useState("");
  const visibleQueue = useMemo(
    () => queue.filter((entry) => citationQueueMatches(entry, queueQuery, articleTitleBySlug)),
    [articleTitleBySlug, queue, queueQuery],
  );
  const selectedIndex = selectedSlug ? visibleQueue.findIndex((entry) => entry.slug === selectedSlug) : -1;
  const inQueue = selectedSlug ? queue.some((entry) => entry.slug === selectedSlug) : false;

  const detailRef = useRef<HTMLElement | null>(null);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  useScrollToDetail(detailRef, pickedSlug);
  const [focusRequest, setFocusRequest] = useState(0);
  const deepLinkRef = useRef(initialSlug ?? null);
  useEffect(() => {
    const wanted = deepLinkRef.current;
    if (!wanted || initialLoading || selectedSlug !== wanted || !queue.some((entry) => entry.slug === wanted)) return;
    deepLinkRef.current = null;
    setPickedSlug(wanted);
    setFocusRequest((value) => value + 1);
  }, [initialLoading, queue, selectedSlug]);
  useEffect(() => {
    if (focusRequest > 0) paneHeadingRef.current?.focus({ preventScroll: false });
  }, [focusRequest]);

  const writeAddress = (slug: string) => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const tool = segments[0] === "dev" && segments[1] ? segments[1] : "citation-review";
    window.history.replaceState(window.history.state, "", `/dev/${tool}/${encodeURIComponent(slug)}${window.location.search}`);
  };

  const select = (slug: string, { focusPane = false }: { focusPane?: boolean } = {}) => {
    setKeyHint(null);
    if (actionFailure && actionFailure.slug !== slug) dismissActionFailure();
    setSelectedSlug(slug);
    setPickedSlug(slug);
    writeAddress(slug);
    if (focusPane) setFocusRequest((value) => value + 1);
  };

  const move = (direction: 1 | -1) => {
    if (visibleQueue.length === 0 || busy) return;
    const next = selectedIndex < 0 ? visibleQueue[0] : visibleQueue[selectedIndex + direction];
    if (next) select(next.slug, { focusPane: true });
  };

  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>("[role='listbox']")?.focus({ preventScroll: true });
  };

  const changeFilter = (filter: CitationReviewQueueFilter) => {
    setKeyHint(null);
    setQueueFilter(filter);
  };

  const showEverything = () => {
    setQueueQuery("");
    changeFilter("all");
  };

  const refresh = () => {
    setRowOrder(null);
    void refreshQueue({ keepSelection: true });
    void loadClaims();
    if (selectedSlug) void refreshDetail(selectedSlug);
  };

  const openNextUnread = useMemo(
    () =>
      nextUnreadKey
        ? () => {
            setOpenRequest((current) => ({ claimKey: nextUnreadKey, nonce: (current?.nonce ?? 0) + 1 }));
          }
        : null,
    [nextUnreadKey],
  );

  const [claimPending, setClaimPending] = useState<"claim" | "release" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const hold = async (action: "claim" | "release") => {
    if (!selectedSlug || claimPending) return;
    const slug = selectedSlug;
    setClaimPending(action);
    try {
      await writeClaim(slug, action);
      setAnnouncement(action === "claim" ? "Claimed. Other admins see that you are reviewing this article." : "Released. Anyone can pick it up.");
    } catch (error) {
      reportActionFailure({
        kind: isFreezeError(error) ? "frozen" : "failed",
        message: error instanceof Error ? error.message : "The claim did not change.",
        slug,
      });
      void loadClaims();
    } finally {
      setClaimPending(null);
    }
  };
  const holdOf = (slug: string) => proposalHoldOf(claims?.get(slug), actorEmail, claims !== null);

  const { helpDialog } = useTriageShortcuts({
    enabled: !initialLoading && (queue.length > 0 || selectedSlug !== null),
    onMove: move,
    onAccept: () => {
      if (!activeClaimKey) {
        setKeyHint(OPEN_A_ROW_HINT);
        return;
      }
      const command = commands.rows[activeClaimKey];
      if (command && !command.approveDisabled) {
        setKeyHint(null);
        handlers.onApprove([activeClaimKey]);
      } else if (command && !command.isPending) {
        setKeyHint(
          command.canApprove
            ? "The open row is already accepted."
            : "The open row has no verified quote, so it cannot be approved. r rejects it with a reason.",
        );
      }
    },
    onReject: () => {
      if (!activeClaimKey) {
        setKeyHint(OPEN_A_ROW_HINT);
        return;
      }
      if (commands.rows[activeClaimKey]?.rejectDisabled === false) {
        setKeyHint(null);
        setRejectRequest((current) => ({ claimKey: activeClaimKey, nonce: (current?.nonce ?? 0) + 1 }));
      } else if (!commands.rows[activeClaimKey]?.isPending) {
        setKeyHint("The open row is already rejected.");
      }
    },
    onUndo: () => {
      if (undoOffer && !undoOffer.disabled) undoOffer.onUndo();
    },
    labels: {
      move: "Next and previous article",
      accept: "Approve the open evidence row",
      reject: "Reject the open evidence row",
    },
  });
  useDevShortcuts(SHORTCUTS, !initialLoading);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (event.key !== "/" && event.key !== "o") return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) return;
      event.preventDefault();
      if (event.key === "/") {
        searchRef.current?.focus();
        return;
      }
      if (openNextUnread) openNextUnread();
      else setKeyHint("Every ready row in this article is open or decided.");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNextUnread]);

  const pending: CitationPendingAction | null = claimPending
    ? claimPending
    : isUndoing
      ? "undo"
      : pendingStatus && isBulkUpdating
        ? "bulk"
        : pendingStatus === "approved"
          ? "approve"
          : pendingStatus === "rejected"
            ? "reject"
            : null;

  const failure = actionFailure && actionFailure.slug === selectedSlug ? actionFailure : null;
  const drained = selectedSlug !== null && !initialLoading && !inQueue;
  const nextWaitingEntry = drained ? visibleQueue.find((entry) => entry.slug !== selectedSlug) ?? null : null;
  const nextWaiting = nextWaitingEntry
    ? { title: titleOf(nextWaitingEntry.slug), onOpen: () => select(nextWaitingEntry.slug, { focusPane: true }) }
    : null;

  let notice: NoticeMessage | null = null;
  if (failure) {
    notice =
      failure.kind === "conflict"
        ? { tone: "warning", title: "Changed by someone else", message: describeConflict(failure.count ?? 1, failure.undo) }
        : failure.kind === "frozen" || frozen
          ? { tone: "danger", message: CITATION_FREEZE_COPY }
          : { tone: "danger", title: "That did not go through", message: failure.message };
  } else if (drained && queueFilter === "open" && undoableDecision?.slug === selectedSlug) {
    notice = {
      tone: "success",
      message: `Every row in ${articleTitle ?? "this article"} is decided, so it left the Open list.`,
    };
  }

  const hiddenByList: ReactNode = (() => {
    if (!selectedSlug || initialLoading) return null;
    if (!inQueue) {
      return (
        <>
          Not in the {CITATION_QUEUE_FILTER_LABEL[queueFilter]} list{undoableDecision?.slug === selectedSlug ? " after your decision" : ""}.{" "}
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={showEverything}>
            Show all articles
          </Button>
        </>
      );
    }
    if (selectedIndex < 0) {
      return (
        <>
          Your search hides this article from the list.{" "}
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setQueueQuery("")}>
            Clear the search
          </Button>
        </>
      );
    }
    return null;
  })();

  const dockUndo = articleUndo ? (
    <CitationUndoBar offer={articleUndo} />
  ) : offscreenUndo ? (
    <div className="space-y-1.5">
      <p className="theme-text-muted text-xs">
        Your last decision was in{" "}
        <Button
          type="button"
          variant="link"
          size="auto"
          className="text-xs"
          onClick={() => select(offscreenUndo.decision.slug, { focusPane: true })}
        >
          {titleOf(offscreenUndo.decision.slug)}
        </Button>
        . Undo reopens it.
      </p>
      <CitationUndoBar offer={offscreenUndo} />
    </div>
  ) : null;

  const queueLoaded = !initialLoading && !(queueError && queue.length === 0);
  const searching = queueQuery.trim().length > 0;
  const countLine = initialLoading
    ? "Loading"
    : queueError && queue.length === 0
      ? "Not loaded"
      : describeListCount(visibleQueue.length, queue.length, searching);

  let empty: ReactNode = null;
  if (queueLoaded && queue.length === 0) {
    empty = (
      <EmptyList
        icon={queueFilter === "open" ? "lucide:circle-check" : "lucide:filter"}
        accent={queueFilter === "open"}
        message={queueFilter === "open" ? `All clear. ${describeEmptyFilter("open")}` : describeEmptyFilter(queueFilter)}
        action={
          <Button
            type="button"
            variant="link"
            size="auto"
            className="text-sm"
            onClick={() => changeFilter(queueFilter === "open" ? "all" : "open")}
          >
            {queueFilter === "open" ? "Show every article with evidence" : "Show the open articles"}
          </Button>
        }
      />
    );
  } else if (queueLoaded && visibleQueue.length === 0) {
    empty = (
      <EmptyList
        icon="lucide:search-x"
        message={`No article matches “${queueQuery.trim()}” in ${CITATION_QUEUE_FILTER_LABEL[queueFilter]}.`}
        action={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {queueFilter !== "all" ? (
              <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => changeFilter("all")}>
                Search every article
              </Button>
            ) : null}
            <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setQueueQuery("")}>
              Clear the search
            </Button>
          </span>
        }
      />
    );
  }

  const listError = queueError ? (
    <LoadErrorState
      what="the citation queue"
      message={queue.length > 0 ? `${formatQueueLoadFailure(queueError)} The list below is from the last successful read.` : formatQueueLoadFailure(queueError)}
      onRetry={() => {
        void refreshQueue({ keepSelection: true });
      }}
      busy={refreshing}
      secondary={(
        <Button asChild variant="quiet" size="quiet">
          <SmartLink href="/review">
            Open Review portal
            <Icon icon="lucide:arrow-up-right" size={14} />
          </SmartLink>
        </Button>
      )}
    />
  ) : null;

  const missingNotice = missingSlug ? (
    <div className="flex items-start gap-2 text-sm" role="status">
      <Icon icon="lucide:triangle-alert" size={15} className="theme-warning-text-strong mt-0.5 shrink-0" />
      <p className="theme-text-secondary min-w-0 flex-1">
        The link named “{missingSlug}”, which has no {CITATION_QUEUE_FILTER_LABEL[queueFilter].toLowerCase()} evidence.{" "}
        {queueFilter !== "all" ? (
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => changeFilter("all")}>
            Look under All
          </Button>
        ) : null}
      </p>
      <Button type="button" variant="ghost" size="icon" className={cn("-mr-2 -mt-1 size-8", TOUCH_ICON)} aria-label="Dismiss" onClick={dismissMissing}>
        <Icon icon="lucide:x" size={14} />
      </Button>
    </div>
  ) : null;

  const markerDetail = checklist.find((item) => item.id === "article-diagnostics")?.detail ?? "";
  const markerState: "loading" | "failed" | "ready" = selectedArticle
    ? "ready"
    : selectedSlug && failedSlugs?.has(selectedSlug)
      ? "failed"
      : "loading";

  const renderSections = () => {
    return sectionGroups.map((group) => (
      <CitationEvidenceSection
        key={group.section}
        group={group}
        commands={commands}
        handlers={handlers}
        openedClaimKeys={openedClaimKeys}
        rowUndo={rowUndo}
        rejectRequest={rejectRequest}
        openRequest={openRequest}
        activeClaimKey={activeClaimKey}
        pendingStatus={pendingStatus}
        sectionUndo={setUndo && bulkOrigin === group.section ? setUndo : null}
        onApproveSection={(section, claimKeys) => {
          confirmApproval(claimKeys, `in ${formatCitationSectionLabel(section)}`, section);
        }}
      />
    ));
  };

  let paneBody: ReactNode;
  if (detailError) {
    paneBody = (
      <>
        <LoadErrorState
          what={`the evidence for ${articleTitle ?? "this article"}`}
          message={rows.length > 0 ? `${detailError} The rows below are from the last successful read.` : detailError}
          onRetry={() => {
            if (selectedSlug) void refreshDetail(selectedSlug);
          }}
        />
        {renderSections()}
      </>
    );
  } else if (isDetailLoading) {
    paneBody = <SectionsSkeleton />;
  } else if (sectionGroups.length === 0) {
    paneBody = <p className="theme-text-muted text-sm">No evidence rows for this article yet.</p>;
  } else {
    paneBody = renderSections();
  }

  const paneVisible = selectedSlug !== null;
  const paneOnPhone = pickedSlug !== null && pickedSlug === selectedSlug;

  return (
    <div className="space-y-6">
      <DevToolSection
        tool="citation-review"
        description="Each evidence row pairs a claim in an article with a quote checked against its source. Approving a row makes that quote part of the article's public evidence at once; rejecting it keeps your reason for the next editor."
      >
        <p className="theme-text-secondary text-sm" aria-live="polite">
          {initialLoading ? "Loading the queue." : queueError && queue.length === 0 ? "The queue did not load." : describeQueueTotals(queue, queueFilter)}
        </p>
      </DevToolSection>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <CitationQueuePanel
          listRef={listRef}
          headingId={listHeadingId}
          searchId={searchId}
          searchRef={searchRef}
          queue={visibleQueue}
          selectedSlug={selectedSlug}
          articleTitleBySlug={articleTitleBySlug}
          onSelectSlug={(slug) => select(slug)}
          query={queueQuery}
          onQueryChange={setQueueQuery}
          filter={queueFilter}
          onFilterChange={changeFilter}
          countLine={countLine}
          refreshing={refreshing}
          onRefresh={refresh}
          busy={busy}
          holdOf={claims !== null ? holdOf : undefined}
          loaded={queueLoaded}
          empty={empty}
          error={listError}
          notice={missingNotice}
          freshness={<DevRailBadgeFreshness badge="citations" noun="articles" />}
        />

        <section
          ref={detailRef}
          aria-label={articleTitle ? `Review: ${articleTitle}` : "Review"}
          className={cn(
            "min-w-0 scroll-mt-24",
            paneVisible
              ? !paneOnPhone && "hidden lg:block"
              : initialLoading || queueLoaded
                ? "hidden lg:block"
                : "hidden",
          )}
        >
          {initialLoading ? (
            <CitationPaneSkeleton />
          ) : selectedSlug && articleTitle ? (
            <CitationArticlePane
              key={selectedSlug}
              slug={selectedSlug}
              title={articleTitle}
              headingId={paneHeadingId}
              headingRef={paneHeadingRef}
              position={selectedIndex >= 0 ? { index: selectedIndex, total: visibleQueue.length } : null}
              onMove={move}
              onBackToList={backToList}
              hiddenByList={hiddenByList}
              lastChange={lastChange}
              tally={tally}
              rowsState={detailError ? "failed" : "loading"}
              checklist={checklist}
              markers={{
                state: markerState,
                summary: markerDetail,
                onRetry: () => requestArticle(selectedSlug),
                panel: selectedArticle ? <EditorCitationDiagnosticsPanel article={selectedArticle} headingLevel="h5" /> : null,
              }}
              busy={busy || claimPending !== null}
              pending={pending}
              frozen={frozen}
              notice={notice}
              onDismissNotice={dismissActionFailure}
              keyHint={keyHint}
              hold={holdOf(selectedSlug)}
              onClaim={() => void hold("claim")}
              onRelease={() => void hold("release")}
              bulk={isDetailLoading || sectionGroups.length === 0 ? null : commands.bulkApprove}
              openedReadyCount={openedReadyCount}
              onApproveAll={() => {
                confirmApproval(commands.bulkApprove.claimKeys, `for ${articleTitle}`, "article");
              }}
              onOpenNextUnread={openNextUnread}
              undoSlot={dockUndo}
              nextWaiting={nextWaiting}
            >
              {paneBody}
            </CitationArticlePane>
          ) : queueLoaded ? (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              {queue.length === 0
                ? "Nothing to review under this filter."
                : (
                  <>
                    Pick an article to read its evidence and decide on it here
                    <span className="[@media(pointer:coarse)]:hidden">
                      , or press <kbd className="theme-dev-kbd">j</kbd> to start at the top
                    </span>
                    .
                  </>
                )}
            </EmptyStateSurface>
          ) : null}
        </section>
      </div>

      {dialog}
      {helpDialog}
    </div>
  );
}

function EmptyList({
  icon,
  message,
  action,
  accent = false,
}: {
  icon: string;
  message: string;
  action?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-4 py-5 text-sm">
      <p className="theme-text-secondary flex items-start gap-2">
        <Icon icon={icon} size={16} className={cn("mt-0.5 shrink-0", accent ? "theme-icon-accent" : "theme-text-faint")} />
        <span>{message}</span>
      </p>
      {action ? <div className="ml-6 mt-2">{action}</div> : null}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading evidence</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} aria-hidden className="space-y-2">
          <span className="theme-skeleton-pulse block h-4 w-1/4 rounded-chip" />
          <span className="theme-skeleton-pulse block h-14 w-full rounded-card" />
        </div>
      ))}
    </div>
  );
}
