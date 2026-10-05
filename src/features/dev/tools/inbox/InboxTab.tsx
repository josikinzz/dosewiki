"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  EditorField,
  EditorList,
  EditorListRow,
  EditorPanel,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  LoadErrorState,
  Notice,
  TriageShortcutHint,
  useConfirm,
  useScrollToDetail,
  useTriageShortcuts,
  useUnsavedWork,
  useWriteFreeze,
} from "@/features/dev/components";
import { useDevRailBadgeReadings, invalidateDevRailBadge, type DevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";
import { useLibraryIfPresent } from "@/data/SubstanceIndexProvider";
import { cn } from "@/lib/utils";

import {
  INBOX_ASSIGNMENTS,
  CHIP_OF_SOURCE,
  INBOX_CHIPS,
  SOURCE_LABEL,
  URGENCY_LABEL,
  countByAssignment,
  countByChip,
  describeLoadFailures,
  filterInboxItems,
  joinWords,
  sameActor,
  sortInboxItems,
  urgencyTone,
  type InboxAssignment,
  type InboxChip,
  type InboxItem,
  type InboxLoadFailure,
  type InboxSourceId,
} from "./inboxModel";
import { readInboxNotes, writeInboxNotes, type InboxNotes } from "./inboxNotes";
import {
  BADGE_OF_SOURCE,
  createInboxSources,
  type InboxClaim,
  type InboxDecision,
  type InboxSourceAdapter,
} from "./inboxSources";

type InboxNotice = {
  tone: "success" | "danger" | "info";
  message: string;
  /** Offers Undo beside the message: the item the last decision moved. */
  undoKey?: string;
};

/** The last decision the Inbox made, so `u` and Undo can take it back. */
type LastDecision = { key: string; source: InboxSourceId; id: string; title: string; label: string };

type PendingAction = "claim" | "release" | "takeover" | "undo" | InboxDecision;

const ALL_CHIPS = "all";

const DECISION_LABEL: Record<InboxSourceId, Record<InboxDecision, string>> = {
  "trip-reports": { accept: "Accept", reject: "Reject", spam: "Mark as spam" },
  "article-feedback": { accept: "Resolve", reject: "Reject", spam: "Mark as spam" },
  "site-feedback": { accept: "Resolve", reject: "Reject", spam: "Mark as spam" },
  "glossary-feedback": { accept: "Resolve", reject: "Reject", spam: "Mark as spam" },
  citations: { accept: "Approve", reject: "Reject", spam: "Mark as spam" },
  proposals: { accept: "Approve", reject: "Reject", spam: "Mark as spam" },
  "review-recommendations": { accept: "Approve", reject: "Reject", spam: "Mark as spam" },
};

/** What a pending button reads while its write is in flight. */
const PENDING_LABEL: Record<InboxSourceId, Record<PendingAction, string>> = Object.fromEntries(
  Object.entries(DECISION_LABEL).map(([source, labels]) => [
    source,
    {
      claim: "Claiming",
      release: "Releasing",
      takeover: "Taking over",
      undo: "Undoing",
      accept: labels.accept === "Accept" ? "Accepting" : labels.accept === "Resolve" ? "Resolving" : "Approving",
      reject: "Rejecting",
      spam: "Marking as spam",
    },
  ]),
) as Record<InboxSourceId, Record<PendingAction, string>>;

/** The key each decision answers to, shown on the button and in aria-keyshortcuts. */
const DECISION_KEY: Record<InboxDecision, string> = { accept: "a", reject: "r", spam: "s" };

/** The owning tool's glyph beside each source, read from the registry's icons. */
const SOURCE_ICON: Record<InboxSourceId, string> = {
  "trip-reports": "lucide:notebook-pen",
  "article-feedback": "lucide:message-square-text",
  "site-feedback": "lucide:message-square-text",
  "glossary-feedback": "lucide:languages",
  citations: "lucide:quote",
  proposals: "lucide:git-pull-request-arrow",
  "review-recommendations": "lucide:git-pull-request-arrow",
};

/** Plural name of what each rail count counts, for the freshness line. */
const NOUN: Record<string, string> = {
  "trip-reports": "trip reports",
  feedback: "feedback",
  proposals: "proposals",
  citations: "citation articles",
  "glossary-feedback": "glossary feedback",
  "review-recommendations": "review recommendations",
};

async function loadClaims(): Promise<Map<string, InboxClaim>> {
  const response = await fetch("/api/dev/inbox/claims", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { claims?: unknown; error?: unknown } | null;
  if (!response.ok || !payload || !Array.isArray(payload.claims)) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Could not load who is working on what.",
    );
  }
  return new Map((payload.claims as InboxClaim[]).map((claim) => [`${claim.source}:${claim.item_id}`, claim]));
}

/** A readable name for a claimer: "You" for the signed-in admin. */
function claimerName(value: string, actorEmail: string | null): string {
  return sameActor(value, actorEmail) ? "You" : formatReviewerIdentity(value) ?? value;
}

/**
 * The Inbox: one list of everything that waits on an admin, from Trip
 * reports, Feedback (article, site and glossary), Citations and Change Review
 * (proposals and review recommendations). Each source adapter lists the same
 * bucket its rail badge counts, so every counted item is reachable here.
 *
 * Most urgent first, then oldest first. Claiming an item marks it Reviewing
 * with the claimer's name, so a second admin sees who has it. The owning
 * tool's detail renders in place; decisions that need the owning tool's own
 * checks (publishing, citation evidence) open it instead.
 *
 * Layout: the list and its filters on the left (sticky on desktop), the
 * review pane on the right with one header (title, source, age, claim) and a
 * decision bar that stays in view at the bottom of the screen while the pane
 * is on it. Below `lg` the two stack, picking a row scrolls the pane in, and
 * the pane carries Back to list and previous/next so a phone never has to
 * scroll back up to keep triaging.
 */
export function InboxTab({ actorEmail }: { actorEmail: string | null }) {
  const [sources] = useState<InboxSourceAdapter[]>(() => createInboxSources());
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const [loadedItems, setItems] = useState<InboxItem[] | null>(null);
  // Citation rows arrive keyed by slug. Once the shell's corpus lands (the
  // registry starts it without blocking), they read as article titles.
  const library = useLibraryIfPresent();
  const substanceRecords = library?.allSubstanceRecords;
  const items = useMemo(() => {
    if (!loadedItems || !substanceRecords?.length) return loadedItems;
    const titles = new Map(substanceRecords.map((record) => [record.slug, record.name]));
    return loadedItems.map((item) =>
      item.source === "citations" && titles.has(item.id) ? { ...item, title: titles.get(item.id) as string } : item,
    );
  }, [loadedItems, substanceRecords]);
  const [errors, setErrors] = useState<InboxLoadFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [chip, setChip] = useState<InboxChip | null>(null);
  const [assignment, setAssignment] = useState<InboxAssignment>("everyone");
  // Citation reviews outnumber everything people send in, so All starts
  // without them. The Citations chip always shows them.
  const [hideCitations, setHideCitations] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Drafts live in this browser until the decision they travel with. Nothing
  // above the selected pane renders them, so reading storage here cannot
  // disturb hydration.
  const [notes, setNotes] = useState<InboxNotes>(() => readInboxNotes(actorEmail));
  const [notesKept, setNotesKept] = useState(true);
  const [pending, setPending] = useState<{ key: string; action: PendingAction } | null>(null);
  const [notice, setNotice] = useState<InboxNotice | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);
  const loadVersion = useRef(0);
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { frozen } = useWriteFreeze();

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    const failures: InboxLoadFailure[] = [];
    let claims = new Map<string, InboxClaim>();
    try {
      claims = await loadClaims();
    } catch (error) {
      failures.push({ source: "Claims", message: error instanceof Error ? error.message : "Could not load claims." });
    }
    const results = await Promise.allSettled(sources.map((source) => source.list({ claims })));
    if (version !== loadVersion.current) return;
    const loaded: InboxItem[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        loaded.push(...result.value);
      } else {
        failures.push({
          source: SOURCE_LABEL[sources[index].id],
          message: result.reason instanceof Error ? result.reason.message : "Could not load this queue.",
        });
      }
    });
    setItems(loaded);
    setErrors(failures);
    setLoading(false);
  }, [sources]);

  useEffect(() => {
    void load();
    return () => {
      ++loadVersion.current;
    };
  }, [load]);

  const sorted = useMemo(() => sortInboxItems(items ?? []), [items]);
  const visible = useMemo(
    () => filterInboxItems(sorted, { assignment, chip, actor: actorEmail, hideCitations }),
    [sorted, assignment, chip, actorEmail, hideCitations],
  );
  const chipCounts = useMemo(
    () => countByChip(filterInboxItems(sorted, { assignment, chip: null, actor: actorEmail })),
    [sorted, assignment, actorEmail],
  );
  const assignmentCounts = useMemo(
    () => countByAssignment(sorted, { chip, actor: actorEmail, hideCitations }),
    [sorted, chip, actorEmail, hideCitations],
  );
  const selectedIndex = visible.findIndex((item) => item.key === selectedKey);
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : null;
  const selectedSource = selected ? sourceById.get(selected.source) ?? null : null;
  const note = selected ? notes[selected.key] ?? "" : "";

  // Picking a row below `lg` brings the pane into view; a desktop pick stays put.
  useScrollToDetail(reviewRef, selected?.key ?? null);

  useEffect(() => {
    setNotesKept(writeInboxNotes(actorEmail, notes));
  }, [actorEmail, notes]);

  // Kept notes survive leaving, so only notes this browser could not store
  // are at stake. They cannot be sent on their own, so the dialog offers
  // Discard and Keep editing, never Save.
  const typedNotes = Object.values(notes).filter((value) => value.trim()).length;
  useUnsavedWork({
    id: "inbox:notes",
    tab: "inbox",
    label: `Inbox: ${typedNotes} review ${typedNotes === 1 ? "note" : "notes"}, sent only when you resolve, reject or mark as spam`,
    dirty: !notesKept && typedNotes > 0,
    discard: () => setNotes({}),
  });

  /** A hand-picked item: the last result belonged to another item, so it goes. */
  const select = (key: string | null) => {
    setSelectedKey(key);
    if (key !== selectedKey) setNotice(null);
  };

  /** Put a changed item back in the list (or back into it, after an undo), or drop it when it left the Inbox. */
  const replaceItem = (key: string, next: InboxItem | null) => {
    setItems((current) => {
      if (current === null) return current;
      if (next === null) return current.filter((item) => item.key !== key);
      return current.some((item) => item.key === key)
        ? current.map((item) => (item.key === key ? next : item))
        : [...current, next];
    });
  };

  const run = async (
    item: InboxItem,
    action: PendingAction,
    work: () => Promise<InboxItem | null>,
    done: (next: InboxItem | null) => void,
  ) => {
    if (pending) return;
    setPending({ key: item.key, action });
    setNotice(null);
    try {
      const next = await work();
      if (next === null) {
        // The next row takes the selection, so triage keeps its rhythm.
        const index = visible.findIndex((entry) => entry.key === item.key);
        const following = visible[index + 1] ?? visible[index - 1] ?? null;
        setSelectedKey(following?.key ?? null);
      }
      replaceItem(item.key, next);
      invalidateDevRailBadge(BADGE_OF_SOURCE[item.source]);
      done(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That did not go through.";
      setNotice({
        tone: "danger",
        message: /frozen/i.test(message)
          ? "Writes are paused, so that was not saved. Try again once they resume."
          : message,
      });
    } finally {
      setPending(null);
    }
  };

  /** Claims change the claim strip in place; a screen reader hears the same sentence. */
  const claim = (item: InboxItem) => {
    const source = sourceById.get(item.source);
    if (!source) return;
    void run(item, "claim", () => source.actions.claim(item.id), () => setAnnouncement(`You are reviewing "${item.title}".`));
  };

  const takeOver = (item: InboxItem) => {
    const source = sourceById.get(item.source);
    const takeOverClaim = source?.actions.takeOver;
    if (!takeOverClaim || !item.claimedBy) return;
    const who = formatReviewerIdentity(item.claimedBy) ?? item.claimedBy;
    confirm({
      title: "Take over this claim?",
      description: `${who} is working on ${item.title}. Taking over makes you the claimer, and the Inbox shows your name to everyone, ${who} included.`,
      confirmLabel: "Take over",
      onConfirm: () =>
        run(item, "takeover", () => takeOverClaim(item.id), () => setAnnouncement(`You took over "${item.title}" from ${who}.`)),
    });
  };

  const release = (item: InboxItem) => {
    const source = sourceById.get(item.source);
    if (!source) return;
    void run(item, "release", () => source.actions.release(item.id), () =>
      setAnnouncement(`Released "${item.title}" for anyone to pick up.`),
    );
  };

  const decide = (decision: InboxDecision) => {
    if (!selected || !selectedSource || pending) return;
    const item = selected;
    const source = selectedSource;
    const label = DECISION_LABEL[item.source][decision];
    if (!source.actions.decide || !source.actions.decisions(item).includes(decision)) {
      setNotice({
        tone: "info",
        message: source.actions.decide
          ? `"${item.title}" cannot be moved that way from ${INTAKE_STATUS_LABEL[item.status]}.`
          : `${source.toolLabel} makes this decision. Use Open in ${source.toolLabel}.`,
      });
      return;
    }
    const itemNote = notes[item.key] ?? "";
    const write = () =>
      run(
        item,
        decision,
        async () => {
          const next = await source.actions.decide!(item.id, decision, itemNote);
          setNotes((current) => {
            const { [item.key]: _sent, ...rest } = current;
            return rest;
          });
          return next;
        },
        (next) => {
          setLastDecision({ key: item.key, source: item.source, id: item.id, title: item.title, label });
          setNotice({
            tone: "success",
            message: `${label}: "${item.title}"${next ? ` is now ${INTAKE_STATUS_LABEL[next.status]}` : " left the Inbox"}.`,
            undoKey: item.key,
          });
        },
      );
    if (decision === "accept") {
      void write();
      return;
    }
    confirm({
      title: decision === "spam" ? "Mark as spam?" : "Reject this item?",
      description: `${item.title} leaves the Inbox. ${itemNote.trim() ? "Your note is added to its decision log." : "No note is attached."}`,
      confirmLabel: label,
      destructive: true,
      onConfirm: write,
    });
  };

  const undoTarget = lastDecision ? sourceById.get(lastDecision.source) ?? null : null;
  const canUndo = Boolean(lastDecision && undoTarget?.actions.undo);

  const undo = () => {
    if (!lastDecision || !undoTarget?.actions.undo || pending) return;
    const decision = lastDecision;
    const target = undoTarget;
    const placeholder = items?.find((entry) => entry.key === decision.key) ?? ({
      key: decision.key,
      source: decision.source,
      id: decision.id,
      title: decision.title,
    } as InboxItem);
    void run(
      placeholder,
      "undo",
      async () => {
        const work = target.actions.undo!(decision.id);
        if (!work) throw new Error(`"${decision.title}" cannot go back from here. Open it in ${target.toolLabel}.`);
        return work;
      },
      (next) => {
        setLastDecision(null);
        if (next) setSelectedKey(next.key);
        setNotice({
          tone: "success",
          message: `Undone. "${decision.title}"${next ? ` is ${INTAKE_STATUS_LABEL[next.status]} again` : " is back"}.`,
        });
      },
    );
  };

  const move = (direction: 1 | -1) => {
    if (visible.length === 0) return;
    const next = selectedIndex < 0 ? (direction === 1 ? 0 : visible.length - 1) : selectedIndex + direction;
    const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
    select(target.key);
  };

  const { helpDialog } = useTriageShortcuts({
    onMove: move,
    onAccept: () => decide("accept"),
    onReject: () => decide("reject"),
    onSpam: () => decide("spam"),
    onNote: () => noteRef.current?.focus(),
    onUndo: undo,
    labels: {
      move: "Next and previous item, across every source",
      accept: "Accept, Resolve or Approve, as the item's tool names it",
      undo: "Undo the last decision made here",
    },
  });

  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
  };

  const resetFilters = () => {
    setChip(null);
    setAssignment("everyone");
    setHideCitations(false);
  };

  const busy = pending !== null;
  const queueFailures = errors.filter((error) => error.source !== "Claims").length;
  const loadFailure = describeLoadFailures(errors, queueFailures === sources.length);
  const counted = items !== null && !loading;
  // A queue that failed has no count: its chip shows none rather than zero, and neither do the totals.
  const failedChips = new Set(
    errors.flatMap((error) => {
      const id = (Object.keys(SOURCE_LABEL) as InboxSourceId[]).find((source) => SOURCE_LABEL[source] === error.source);
      return id ? [CHIP_OF_SOURCE[id]] : [];
    }),
  );
  const totalsKnown = counted && failedChips.size === 0;
  const citationsHidden = hideCitations && chip === null && chipCounts.citations > 0;
  const filtered = chip !== null || assignment !== "everyone" || citationsHidden;
  const narrowedBy = [
    assignment !== "everyone" ? INBOX_ASSIGNMENTS.find((option) => option.value === assignment)!.label : null,
    chip ? INBOX_CHIPS.find((option) => option.value === chip)!.label : null,
  ].filter((word): word is string => Boolean(word));

  return (
    <div className="space-y-6">
      <EditorSection
        icon="lucide:inbox"
        title="Inbox"
        description="Everything waiting on an admin, most urgent first, then oldest. Claim an item so nobody else triages it."
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <EditorSegmentedControl
            label="Assigned to"
            options={INBOX_ASSIGNMENTS.map((option) => ({
              ...option,
              ...(totalsKnown ? { badge: String(assignmentCounts[option.value]) } : {}),
            }))}
            value={assignment}
            onChange={(value) => setAssignment(value as InboxAssignment)}
          />
          <EditorSegmentedControl
            label="Source"
            options={[
              {
                value: ALL_CHIPS,
                label: "All",
                ...(totalsKnown
                  ? {
                      badge: String(
                        Object.values(chipCounts).reduce((sum, count) => sum + count, 0) -
                          (hideCitations ? chipCounts.citations : 0),
                      ),
                    }
                  : {}),
              },
              ...INBOX_CHIPS.map((option) => ({
                ...option,
                ...(counted && !failedChips.has(option.value) ? { badge: String(chipCounts[option.value]) } : {}),
              })),
            ]}
            value={chip ?? ALL_CHIPS}
            onChange={(value) => setChip(value === ALL_CHIPS ? null : (value as InboxChip))}
          />
        </div>
        {citationsHidden ? (
          <p className="theme-text-muted text-sm">
            {`${chipCounts.citations} citation ${chipCounts.citations === 1 ? "review is" : "reviews are"} hidden from All. `}
            <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setHideCitations(false)}>
              Show them
            </Button>
          </p>
        ) : chip === null && !hideCitations && chipCounts.citations > 0 ? (
          <p className="theme-text-muted text-sm">
            <Button type="button" variant="link" size="auto" className="text-sm" onClick={() => setHideCitations(true)}>
              Hide citation reviews
            </Button>
          </p>
        ) : null}
        <RailCountFreshness />
        {loadFailure ? (
          <LoadErrorState what={loadFailure.what} message={loadFailure.message} onRetry={() => void load()} busy={loading} />
        ) : null}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
        <section
          ref={listRef}
          aria-labelledby={`${noteId}-waiting`}
          className="scroll-mt-24 space-y-3 lg:sticky lg:top-24"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${noteId}-waiting`} className="type-meta-label theme-text-muted">
              Waiting
            </h3>
            <div className="flex items-center gap-2">
              <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
                {items === null
                  ? "Loading"
                  : filtered
                    ? `${visible.length} of ${sorted.length} shown`
                    : `${sorted.length} waiting`}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-mr-2"
                onClick={() => void load()}
                disabled={loading || busy}
                aria-busy={loading || undefined}
              >
                <Icon icon="lucide:refresh-cw" size={14} className={cn(loading && "motion-safe:animate-spin")} />
                {loading ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </div>
          {items === null ? (
            <ListSkeleton />
          ) : (
            <EditorList
              items={visible}
              getKey={(item) => item.key}
              selectedKey={selected?.key ?? null}
              onSelect={select}
              label="Inbox items"
              emptyText={
                sorted.length === 0
                  ? loadFailure
                    ? "Nothing loaded."
                    : "All clear. Nothing is waiting on an admin."
                  : "Nothing matches these filters."
              }
              estimateRowHeight={76}
              maxHeight="min(calc(100dvh - 13rem), 720px)"
              renderItem={(item, { selected: active }) => <InboxRow item={item} active={active} actorEmail={actorEmail} />}
            />
          )}
          {items !== null && visible.length === 0 && sorted.length > 0 ? (
            <p className="theme-text-muted text-sm">
              {narrowedBy.length === 0
                ? "Only citation reviews are waiting. "
                : `${sorted.length} ${sorted.length === 1 ? "item waits" : "items wait"} outside ${joinWords(narrowedBy)}. `}
              <Button type="button" variant="link" size="auto" className="text-sm" onClick={resetFilters}>
                Show everything
              </Button>
            </p>
          ) : null}
          <TriageShortcutHint>
            <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move, <kbd className="theme-dev-kbd">u</kbd> undo
          </TriageShortcutHint>
        </section>

        <section
          ref={reviewRef}
          aria-label={selected ? `Review: ${selected.title}` : "Review"}
          className={cn(
            "scroll-mt-24",
            !selected && !notice && (items === null || (sorted.length === 0 && loadFailure) ? "hidden" : "hidden lg:block"),
          )}
        >
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
          {selected && selectedSource ? (
            <ReviewPane
              key={selected.key}
              item={selected}
              source={selectedSource}
              actorEmail={actorEmail}
              position={{ index: selectedIndex, total: visible.length }}
              onMove={move}
              onBackToList={backToList}
              pending={pending?.key === selected.key ? pending.action : null}
              busy={busy}
              frozen={frozen}
              notice={notice}
              onDismissNotice={() => setNotice(null)}
              canUndo={canUndo}
              onUndo={undo}
              onClaim={() => claim(selected)}
              onTakeOver={() => takeOver(selected)}
              onRelease={() => release(selected)}
              onDecide={decide}
              note={note}
              noteId={noteId}
              noteRef={noteRef}
              onNoteChange={(value) => setNotes((current) => ({ ...current, [selected.key]: value }))}
            />
          ) : (
            <div className="space-y-3">
              {notice ? (
                <InboxNoticeLine notice={notice} canUndo={canUndo} busy={busy} onUndo={undo} onDismiss={() => setNotice(null)} />
              ) : null}
              <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted hidden text-sm lg:block">
                {sorted.length === 0 && items !== null && !loadFailure ? (
                  <span className="flex items-center gap-2">
                    <Icon icon="lucide:circle-check" size={16} className="theme-icon-accent shrink-0" />
                    Nothing to review. New reports, feedback and proposals land here.
                  </span>
                ) : (
                  <>
                    Pick an item to review it here
                    <span className="[@media(pointer:coarse)]:hidden">
                      , or press <kbd className="theme-dev-kbd">j</kbd> to start at the top
                    </span>
                    .
                  </>
                )}
              </EmptyStateSurface>
            </div>
          )}
        </section>
      </div>
      {confirmDialog}
      {helpDialog}
    </div>
  );
}

/** One quiet line when any rail count behind the Inbox badge failed to refresh; the list itself reads each queue directly. */
function RailCountFreshness() {
  const readings = useDevRailBadgeReadings();
  const failed = (Object.entries(readings) as [DevRailBadge, (typeof readings)[DevRailBadge]][]).filter(
    ([, reading]) => reading.failed,
  );
  if (failed.length === 0) return null;
  const parts = failed.map(([badge, reading]) => {
    const noun = NOUN[badge] ?? badge;
    if (reading.count === null || reading.updatedAt === null) return `${noun} (never loaded)`;
    const at = new Date(reading.updatedAt);
    return `${noun} (last known ${reading.count}, as of ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
  });
  return (
    <p role="status" className="theme-text-muted flex flex-wrap items-center gap-x-2 text-xs">
      <Icon icon="lucide:triangle-alert" size={13} className="theme-warning-text-strong shrink-0" />
      <span>
        {`The rail ${failed.length === 1 ? "count" : "counts"} for ${joinWords(parts)} could not refresh. This list reads each queue directly.`}
      </span>
      <Button
        type="button"
        variant="link"
        size="auto"
        className="text-xs"
        onClick={() => failed.forEach(([badge]) => invalidateDevRailBadge(badge))}
      >
        Retry counts
      </Button>
    </p>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading the Inbox</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="space-y-2 rounded-xl px-3 py-3 [background:var(--theme-frosted-control-on-panel-bg)]"
        >
          <span className="theme-skeleton-pulse block h-3.5 rounded-chip" style={{ width: `${70 - index * 8}%` }} />
          <span className="theme-skeleton-pulse block h-3 w-2/5 rounded-chip" />
        </div>
      ))}
    </div>
  );
}

/** The age of an item as relative words, with the full date on hover. */
function Age({ iso, className }: { iso: string; className?: string }) {
  const day = iso ? describeDay(iso) : null;
  if (!day) return null;
  return (
    <time dateTime={iso} title={day.full} className={className}>
      {day.relative}
    </time>
  );
}

/** Two lines at a fixed pitch for the windowed list: title and pills, then source, age, claimer and summary. */
function InboxRow({ item, active, actorEmail }: { item: InboxItem; active: boolean; actorEmail: string | null }) {
  const tone = urgencyTone(item.urgency);
  const claimer = item.claimedBy ? claimerName(item.claimedBy, actorEmail) : null;
  return (
    <EditorListRow active={active} className="items-start">
      <Icon
        icon={SOURCE_ICON[item.source]}
        size={15}
        className={cn("mt-0.5 shrink-0", active ? "theme-icon-accent" : "theme-text-faint")}
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-3">
          <span className={`min-w-0 truncate text-sm font-semibold ${active ? "theme-accent-heading" : "theme-text-primary"}`}>
            {item.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {tone && item.urgency !== "low" ? (
              <EditorStatusPill tone={tone}>{URGENCY_LABEL[item.urgency]}</EditorStatusPill>
            ) : null}
            <EditorStatusPill tone={INTAKE_STATUS_TONE[item.status]}>{INTAKE_STATUS_LABEL[item.status]}</EditorStatusPill>
          </span>
        </span>
        <span className="theme-text-muted block truncate text-xs">
          <span className="theme-text-secondary font-medium">{SOURCE_LABEL[item.source]}</span>
          {item.receivedAt && describeDay(item.receivedAt) ? (
            <>
              {" · "}
              <Age iso={item.receivedAt} />
            </>
          ) : null}
          {claimer ? (
            <>
              {" · "}
              <span className="theme-text-secondary">{claimer === "You" ? "You" : `Claimed by ${claimer}`}</span>
            </>
          ) : null}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </span>
      </span>
    </EditorListRow>
  );
}

function InboxNoticeLine({
  notice,
  canUndo,
  busy,
  onUndo,
  onDismiss,
}: {
  notice: InboxNotice;
  canUndo: boolean;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <Notice placement="inline" tone={notice.tone} dismiss={onDismiss}>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{notice.message}</span>
        {notice.undoKey && canUndo ? (
          <Button
            type="button"
            variant="link"
            size="auto"
            className="text-sm"
            disabled={busy}
            aria-keyshortcuts="u"
            onClick={onUndo}
          >
            Undo
          </Button>
        ) : null}
      </span>
    </Notice>
  );
}

type ReviewPaneProps = {
  item: InboxItem;
  source: InboxSourceAdapter;
  actorEmail: string | null;
  position: { index: number; total: number };
  onMove: (direction: 1 | -1) => void;
  onBackToList: () => void;
  pending: PendingAction | null;
  busy: boolean;
  frozen: boolean;
  notice: InboxNotice | null;
  onDismissNotice: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onClaim: () => void;
  onTakeOver: () => void;
  onRelease: () => void;
  onDecide: (decision: InboxDecision) => void;
  note: string;
  noteId: string;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  onNoteChange: (value: string) => void;
};

/**
 * One item under review: a header that names it once (title, source, age,
 * status, urgency, claim), the owning tool's detail, the review note, and a
 * decision bar that sticks to the bottom of the screen while the pane is in
 * view. Sources whose tool decides get one accent action instead: open it.
 */
function ReviewPane({
  item,
  source,
  actorEmail,
  position,
  onMove,
  onBackToList,
  pending,
  busy,
  frozen,
  notice,
  onDismissNotice,
  canUndo,
  onUndo,
  onClaim,
  onTakeOver,
  onRelease,
  onDecide,
  note,
  noteId,
  noteRef,
  onNoteChange,
}: ReviewPaneProps) {
  const decisions = source.actions.decisions(item);
  const decidesHere = Boolean(source.actions.decide);
  const tone = urgencyTone(item.urgency);
  const mine = sameActor(item.claimedBy, actorEmail);
  const labels = DECISION_LABEL[item.source];
  const pendingLabel = PENDING_LABEL[item.source];

  const openLink = (
    <a
      href={item.href}
      className="text-dose-accent-strong theme-accent-underline inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
    >
      Open in {source.toolLabel}
      <Icon icon="lucide:arrow-up-right" size={13} />
    </a>
  );

  const pager = (
    <div className="flex items-center gap-1">
      <span className="theme-text-muted px-1 text-xs tabular-nums">
        {position.index + 1} of {position.total}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Previous item"
        aria-keyshortcuts="k"
        title="Previous item (k)"
        disabled={position.index <= 0}
        onClick={() => onMove(-1)}
      >
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Next item"
        aria-keyshortcuts="j"
        title="Next item (j)"
        disabled={position.index >= position.total - 1}
        onClick={() => onMove(1)}
      >
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  );

  return (
    <EditorPanel className="overflow-visible">
      <header className="theme-portal-rule space-y-3 border-b px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
          {pager}
        </div>

        {source.detailHasHeading ? null : (
          <h3 className="theme-accent-heading text-xl font-semibold leading-tight">{item.title}</h3>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="theme-text-muted flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
            <Icon icon={SOURCE_ICON[item.source]} size={14} className="theme-text-faint shrink-0" />
            <span className="theme-text-secondary font-medium">{SOURCE_LABEL[item.source]}</span>
            {item.receivedAt && describeDay(item.receivedAt) ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  Waiting since <Age iso={item.receivedAt} />
                </span>
              </>
            ) : null}
            {source.detailHasHeading ? null : (
              <>
                <EditorStatusPill tone={INTAKE_STATUS_TONE[item.status]}>{INTAKE_STATUS_LABEL[item.status]}</EditorStatusPill>
                {tone ? <EditorStatusPill tone={tone}>{URGENCY_LABEL[item.urgency]}</EditorStatusPill> : null}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {decidesHere ? openLink : null}
            <span className="hidden lg:contents">{pager}</span>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        {source.detail(item.id)}

        {decidesHere ? (
          <EditorField
            htmlFor={noteId}
            label="Review note"
            description="Optional. Kept in this browser until you resolve, reject or mark as spam, then added to the decision log with that decision."
          >
            <Textarea
              ref={noteRef}
              id={noteId}
              textareaSize="sm"
              value={note}
              disabled={busy}
              aria-keyshortcuts="n"
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="What was checked, or why this was declined."
            />
          </EditorField>
        ) : null}
      </div>

      <footer
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
        aria-label="Decision"
      >
        {notice ? (
          <InboxNoticeLine notice={notice} canUndo={canUndo} busy={busy} onUndo={onUndo} onDismiss={onDismissNotice} />
        ) : null}
        {frozen && !notice ? (
          <p className="theme-text-muted flex items-center gap-2 text-xs">
            <Icon icon="lucide:circle-pause" size={13} className="theme-warning-text-strong shrink-0" />
            Writes are paused right now; a decision will not save until they resume.
          </p>
        ) : null}
        <ClaimStrip
          item={item}
          mine={mine}
          busy={busy}
          pending={pending}
          canRelease={source.actions.canRelease(item)}
          canTakeOver={Boolean(source.actions.takeOver)}
          onClaim={onClaim}
          onTakeOver={onTakeOver}
          onRelease={onRelease}
        />
        {decidesHere ? (
          <div className="flex flex-wrap items-center gap-2">
            {(["accept", "reject", "spam"] as const).map((decision) => (
              <Button
                key={decision}
                type="button"
                size="sm"
                variant={decision === "accept" ? "accent" : "outline"}
                disabled={busy || !decisions.includes(decision)}
                aria-keyshortcuts={DECISION_KEY[decision]}
                aria-busy={pending === decision || undefined}
                onClick={() => onDecide(decision)}
              >
                {pending === decision ? pendingLabel[decision] : labels[decision]}
                {/* The wrapper hides the cap on touch screens; the kbd class sets its own display. */}
                <span aria-hidden className="[@media(pointer:coarse)]:hidden">
                  <kbd className="theme-dev-kbd !text-current opacity-70">{DECISION_KEY[decision]}</kbd>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="theme-text-muted text-sm">
              {source.toolLabel} makes this decision, with its own checks. Open it to continue.
            </p>
            <Button asChild variant="accent" size="sm">
              <a href={item.href}>
                Open in {source.toolLabel}
                <Icon icon="lucide:arrow-up-right" size={14} />
              </a>
            </Button>
          </div>
        )}
      </footer>
    </EditorPanel>
  );
}

function ClaimStrip({
  item,
  mine,
  busy,
  pending,
  canRelease,
  canTakeOver,
  onClaim,
  onTakeOver,
  onRelease,
}: {
  item: InboxItem;
  mine: boolean;
  busy: boolean;
  pending: PendingAction | null;
  canRelease: boolean;
  canTakeOver: boolean;
  onClaim: () => void;
  onTakeOver: () => void;
  onRelease: () => void;
}) {
  let icon: string;
  let iconClass = "theme-text-faint";
  let sentence: string;
  let action: { label: string; pendingLabel: string; kind: PendingAction; onClick: () => void } | null = null;

  if (item.claimedBy === null) {
    const lapsed = item.expiredClaimBy ? formatReviewerIdentity(item.expiredClaimBy) ?? item.expiredClaimBy : null;
    icon = lapsed ? "lucide:clock-alert" : "lucide:user-round";
    if (lapsed) iconClass = "theme-warning-text-strong";
    sentence = lapsed
      ? `Claim expired. ${lapsed} claimed this over a day ago; anyone may pick it up.`
      : "Nobody is reviewing this yet.";
    action = { label: "Claim", pendingLabel: "Claiming", kind: "claim", onClick: onClaim };
  } else if (mine) {
    icon = "lucide:user-round-check";
    iconClass = "theme-icon-accent";
    sentence = "You are reviewing this.";
    if (canRelease) action = { label: "Release", pendingLabel: "Releasing", kind: "release", onClick: onRelease };
  } else {
    const who = formatReviewerIdentity(item.claimedBy) ?? item.claimedBy;
    icon = "lucide:user-round";
    sentence = `Claimed by ${who}.`;
    if (canTakeOver) action = { label: "Take over", pendingLabel: "Taking over", kind: "takeover", onClick: onTakeOver };
  }

  return (
    <div className="theme-portal-rule flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b pb-2.5">
      <Icon icon={icon} size={16} className={cn("shrink-0", iconClass)} />
      <p className={cn("min-w-0 flex-1 text-sm", mine ? "theme-text-primary font-medium" : "theme-text-secondary")}>{sentence}</p>
      {action ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          aria-busy={pending === action.kind || undefined}
          onClick={action.onClick}
        >
          {pending === action.kind ? action.pendingLabel : action.label}
        </Button>
      ) : null}
    </div>
  );
}
