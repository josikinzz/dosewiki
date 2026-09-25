"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import {
  Notice,
  EditorField,
  EditorList,
  EditorListRow,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  LoadErrorState,
  TriageShortcutHint,
  useConfirm,
  useTriageShortcuts,
  useUnsavedWork,
} from "@/features/dev/components";
import { DevRailBadgeFreshness } from "@/features/dev/pages/DevRailBadgeFreshness";
import { INBOX_BADGE_PARTS, invalidateDevRailBadge } from "@/features/dev/pages/useDevRailBadges";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";

import {
  INBOX_ASSIGNMENTS,
  INBOX_CHIPS,
  SOURCE_LABEL,
  URGENCY_LABEL,
  countByChip,
  filterInboxItems,
  sameActor,
  sortInboxItems,
  type InboxAssignment,
  type InboxChip,
  type InboxItem,
  type InboxSourceId,
} from "./inboxModel";
import {
  BADGE_OF_SOURCE,
  createInboxSources,
  type InboxClaim,
  type InboxDecision,
  type InboxSourceAdapter,
} from "./inboxSources";

type Notice = { tone: "success" | "danger" | "info"; message: string };

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

const NOUN: Record<string, string> = {
  "trip-reports": "trip reports",
  feedback: "feedback items",
  proposals: "proposals",
  citations: "citation articles",
  "glossary-feedback": "glossary feedback items",
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
 */
export function InboxTab({ actorEmail }: { actorEmail: string | null }) {
  const [sources] = useState<InboxSourceAdapter[]>(() => createInboxSources());
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [errors, setErrors] = useState<{ source: string; message: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chip, setChip] = useState<InboxChip | null>(null);
  const [assignment, setAssignment] = useState<InboxAssignment>("everyone");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const loadVersion = useRef(0);
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    const failures: { source: string; message: string }[] = [];
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
    () => filterInboxItems(sorted, { assignment, chip, actor: actorEmail }),
    [sorted, assignment, chip, actorEmail],
  );
  const chipCounts = useMemo(
    () => countByChip(filterInboxItems(sorted, { assignment, chip: null, actor: actorEmail })),
    [sorted, assignment, actorEmail],
  );
  const selected = visible.find((item) => item.key === selectedKey) ?? null;
  const selectedSource = selected ? sourceById.get(selected.source) ?? null : null;
  const note = selected ? notes[selected.key] ?? "" : "";

  const typedNotes = Object.values(notes).filter((value) => value.trim()).length;
  useUnsavedWork({
    id: "inbox:notes",
    tab: "inbox",
    label: `Inbox: ${typedNotes} unsent review ${typedNotes === 1 ? "note" : "notes"}`,
    dirty: typedNotes > 0,
    discard: () => setNotes({}),
  });

  /** Put a changed item back in the list, or drop it when it left the Inbox. */
  const replaceItem = (key: string, next: InboxItem | null) => {
    setItems((current) =>
      current === null
        ? current
        : next === null
          ? current.filter((item) => item.key !== key)
          : current.map((item) => (item.key === key ? next : item)),
    );
  };

  const run = async (item: InboxItem, work: () => Promise<InboxItem | null>, success: (next: InboxItem | null) => string) => {
    if (pendingKey) return;
    setPendingKey(item.key);
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
      setNotice({ tone: "success", message: success(next) });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "That did not go through." });
    } finally {
      setPendingKey(null);
    }
  };

  const claim = (item: InboxItem) => {
    const source = sourceById.get(item.source);
    if (!source) return;
    void run(item, () => source.actions.claim(item.id), () => `You are reviewing "${item.title}".`);
  };

  const takeOver = (item: InboxItem) => {
    const source = sourceById.get(item.source);
    const takeOverClaim = source?.actions.takeOver;
    if (!takeOverClaim || !item.claimedBy) return;
    const who = formatReviewerIdentity(item.claimedBy) ?? item.claimedBy;
    confirm({
      title: "Take over this claim?",
      description: `${who} is working on "${item.title}". Taking over makes you the claimer, and the Inbox shows your name to everyone, ${who} included.`,
      confirmLabel: "Take over",
      onConfirm: () =>
        run(item, () => takeOverClaim(item.id), () => `You took over "${item.title}" from ${who}.`),
    });
  };

  const release = (item: InboxItem) => {
    const source = sourceById.get(item.source);
    if (!source) return;
    void run(item, () => source.actions.release(item.id), () => `Released "${item.title}" for anyone to pick up.`);
  };

  const decide = (decision: InboxDecision) => {
    if (!selected || !selectedSource || pendingKey) return;
    const item = selected;
    const source = selectedSource;
    const label = DECISION_LABEL[item.source][decision];
    if (!source.actions.decide || !source.actions.decisions(item).includes(decision)) {
      setNotice({
        tone: "info",
        message: source.actions.decide
          ? `"${item.title}" cannot be moved that way from ${INTAKE_STATUS_LABEL[item.status]}.`
          : `${source.toolLabel} makes this decision. Open it from the review pane.`,
      });
      return;
    }
    const itemNote = notes[item.key] ?? "";
    const write = () =>
      run(
        item,
        async () => {
          const next = await source.actions.decide!(item.id, decision, itemNote);
          setNotes((current) => {
            const { [item.key]: _sent, ...rest } = current;
            return rest;
          });
          return next;
        },
        (next) => `${label}: "${item.title}"${next ? ` is now ${INTAKE_STATUS_LABEL[next.status]}` : ""}.`,
      );
    if (decision === "accept") {
      void write();
      return;
    }
    confirm({
      title: decision === "spam" ? "Mark as spam?" : "Reject this item?",
      description: `"${item.title}" leaves the Inbox. ${itemNote.trim() ? "Your note is added to its decision log." : "No note is attached."}`,
      confirmLabel: label,
      destructive: true,
      onConfirm: write,
    });
  };

  const move = (direction: 1 | -1) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((item) => item.key === selectedKey);
    const next = index < 0 ? (direction === 1 ? 0 : visible.length - 1) : index + direction;
    const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
    setSelectedKey(target.key);
  };

  const { helpDialog } = useTriageShortcuts({
    onMove: move,
    onAccept: () => decide("accept"),
    onReject: () => decide("reject"),
    onSpam: () => decide("spam"),
    onNote: () => noteRef.current?.focus(),
    labels: {
      move: "Next and previous item, across every source",
      accept: "Accept, Resolve or Approve, as the item's tool names it",
    },
  });

  const mine = selected ? sameActor(selected.claimedBy, actorEmail) : false;
  const decisions = selected && selectedSource ? selectedSource.actions.decisions(selected) : [];
  const busy = pendingKey !== null;

  return (
    <div className="space-y-8">
      <EditorSection
        icon="lucide:inbox"
        title="Inbox"
        description="Everything waiting on an admin, most urgent first, then oldest first. Claim an item so nobody else triages it."
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading || busy}>
            <Icon icon="lucide:refresh-cw" size={14} />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <EditorSegmentedControl
            label="Assigned to"
            options={INBOX_ASSIGNMENTS.map((option) => ({ ...option }))}
            value={assignment}
            onChange={(value) => setAssignment(value as InboxAssignment)}
          />
          <EditorSegmentedControl
            label="Source"
            options={[
              { value: ALL_CHIPS, label: "All", badge: String(Object.values(chipCounts).reduce((sum, count) => sum + count, 0)) },
              ...INBOX_CHIPS.map((option) => ({ ...option, badge: String(chipCounts[option.value]) })),
            ]}
            value={chip ?? ALL_CHIPS}
            onChange={(value) => setChip(value === ALL_CHIPS ? null : (value as InboxChip))}
          />
        </div>
        {INBOX_BADGE_PARTS.map((badge) => (
          <DevRailBadgeFreshness key={badge} badge={badge} noun={NOUN[badge] ?? "items"} />
        ))}
        {errors.map((error) => (
          <LoadErrorState
            key={error.source}
            message={`${error.source}: ${error.message}`}
            onRetry={() => void load()}
            busy={loading}
          />
        ))}
      </EditorSection>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <EditorSection
          icon="lucide:list"
          title="Waiting"
          description={items === null ? "Loading" : `${visible.length} of ${sorted.length} shown`}
          delay={0.05}
        >
          <EditorList
            items={visible}
            getKey={(item) => item.key}
            selectedKey={selected?.key ?? null}
            onSelect={setSelectedKey}
            label="Inbox items"
            emptyText={items === null ? "Loading the Inbox." : "Nothing is waiting here."}
            estimateRowHeight={72}
            renderItem={(item, { selected: active }) => <InboxRow item={item} active={active} actorEmail={actorEmail} />}
          />
          <TriageShortcutHint />
        </EditorSection>

        <EditorSection
          icon="lucide:file-search"
          title="Review"
          description={selected ? `${SOURCE_LABEL[selected.source]} · ${selected.title}` : "No item selected"}
          delay={0.1}
        >
          {notice ? (
            <Notice placement="inline" tone={notice.tone === "info" ? "info" : notice.tone} dismiss={() => setNotice(null)}>
              {notice.message}
            </Notice>
          ) : null}
          {selected && selectedSource ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <EditorStatusPill tone="neutral">{SOURCE_LABEL[selected.source]}</EditorStatusPill>
                <EditorStatusPill tone={INTAKE_STATUS_TONE[selected.status]}>
                  {INTAKE_STATUS_LABEL[selected.status]}
                </EditorStatusPill>
                {selected.urgency !== "normal" ? (
                  <EditorStatusPill tone={selected.urgency === "low" ? "neutral" : "danger"}>
                    {URGENCY_LABEL[selected.urgency]}
                  </EditorStatusPill>
                ) : null}
              </div>

              <ClaimLine
                item={selected}
                mine={mine}
                busy={busy}
                canRelease={selectedSource.actions.canRelease(selected)}
                canTakeOver={Boolean(selectedSource.actions.takeOver)}
                onClaim={() => claim(selected)}
                onTakeOver={() => takeOver(selected)}
                onRelease={() => release(selected)}
              />

              {selectedSource.detail(selected.id)}

              {selectedSource.actions.decide ? (
                <div className="space-y-3">
                  <EditorField
                    htmlFor={noteId}
                    label="Review note"
                    description="Optional. Added to the decision log with the decision you make next."
                  >
                    <Textarea
                      ref={noteRef}
                      id={noteId}
                      textareaSize="sm"
                      value={note}
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNotes((current) => ({ ...current, [selected.key]: value }));
                      }}
                      placeholder="What was checked, or why this was declined."
                    />
                  </EditorField>
                  <div className="flex flex-wrap gap-2">
                    {(["accept", "reject", "spam"] as const).map((decision) => (
                      <Button
                        key={decision}
                        type="button"
                        size="sm"
                        variant={decision === "accept" ? "accent" : "outline"}
                        disabled={busy || !decisions.includes(decision)}
                        onClick={() => decide(decision)}
                      >
                        {DECISION_LABEL[selected.source][decision]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="theme-text-muted text-sm">
                  {selectedSource.toolLabel} makes this decision, with its own checks. Open it to continue.
                </p>
              )}

              <Button asChild variant="outline" size="sm">
                <a href={selected.href}>
                  Open in {selectedSource.toolLabel}
                  <Icon icon="lucide:arrow-up-right" size={14} />
                </a>
              </Button>
            </div>
          ) : (
            <EmptyStateSurface padding="lg" radius="lg" className="theme-text-muted text-sm">
              Select an item to review it here.
            </EmptyStateSurface>
          )}
        </EditorSection>
      </div>
      {confirmDialog}
      {helpDialog}
    </div>
  );
}

function ClaimLine({
  item,
  mine,
  busy,
  canRelease,
  canTakeOver,
  onClaim,
  onTakeOver,
  onRelease,
}: {
  item: InboxItem;
  mine: boolean;
  busy: boolean;
  canRelease: boolean;
  canTakeOver: boolean;
  onClaim: () => void;
  onTakeOver: () => void;
  onRelease: () => void;
}) {
  if (item.claimedBy === null) {
    const lapsed = item.expiredClaimBy ? formatReviewerIdentity(item.expiredClaimBy) ?? item.expiredClaimBy : null;
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="theme-text-muted text-sm">
          {lapsed ? `Claim expired. ${lapsed} claimed this over a day ago; anyone may pick it up.` : "Nobody is reviewing this yet."}
        </p>
        <Button type="button" size="sm" variant="accent" disabled={busy} onClick={onClaim}>
          Claim
        </Button>
      </div>
    );
  }
  const who = formatReviewerIdentity(item.claimedBy) ?? item.claimedBy;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="theme-text-primary text-sm">{mine ? "You are reviewing this." : `Claimed by ${who}.`}</p>
      {mine && canRelease ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRelease}>
          Release
        </Button>
      ) : null}
      {!mine && canTakeOver ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onTakeOver}>
          Take over
        </Button>
      ) : null}
    </div>
  );
}

/** Two lines at a fixed pitch for the windowed list: title and pills, then source, age and claimer. */
function InboxRow({ item, active, actorEmail }: { item: InboxItem; active: boolean; actorEmail: string | null }) {
  const claimer = item.claimedBy
    ? sameActor(item.claimedBy, actorEmail)
      ? "You"
      : formatReviewerIdentity(item.claimedBy) ?? item.claimedBy
    : "Unassigned";
  return (
    <EditorListRow active={active} className="items-start">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-3">
          <span className={`min-w-0 truncate text-sm font-semibold ${active ? "theme-accent-heading" : "theme-text-primary"}`}>
            {item.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {item.urgency === "critical" || item.urgency === "high" ? (
              <EditorStatusPill tone="danger">{URGENCY_LABEL[item.urgency]}</EditorStatusPill>
            ) : null}
            <EditorStatusPill tone={INTAKE_STATUS_TONE[item.status]}>{INTAKE_STATUS_LABEL[item.status]}</EditorStatusPill>
          </span>
        </span>
        <span className="theme-text-muted block truncate text-xs">
          <span className="theme-text-secondary font-medium">{SOURCE_LABEL[item.source]}</span>
          {" · "}
          {claimer}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </span>
      </span>
    </EditorListRow>
  );
}
