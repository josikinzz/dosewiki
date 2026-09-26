"use client";

/**
 * Review Inbox: one list of everything in a locale that needs a person, across
 * the glossary, UI label, and article scopes. Self-contained (it takes only a
 * locale), so the workbench layout can move it without rewiring.
 *
 * Laid out as a triage workspace: the list on the left (a roving list whose
 * focused item is the one under review), the item in a pane on the right with
 * its facts and a decision dock at the bottom. Below `lg` the pane follows the
 * list; picking an item scrolls to it and the pane carries Back to list.
 *
 * Accept calls the existing confirm, save-and-approve, or feedback resolve
 * mutation with the revision shown; Edit opens that item's existing editor;
 * Fine here records a durable exception for a QA finding; Skip hides the item
 * for this browser session. Keys: J and K move, A accepts, E edits, F marks
 * fine, S skips, U undoes. When Accept leaves out an approved glossary
 * rendering, the dock shows the term with its own "Fine here" choice, which
 * resends the save with that term as a glossary exception.
 *
 * A stray key must never put machine text in use, so A alone only schedules
 * the accept: the item leaves the list and the notice offers Undo for 10
 * seconds before anything is written. The Accept button writes at once. The
 * single-letter keys can be turned off for this browser (WCAG 2.1.4).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { focusRingClassName } from "@/components/ui/surface";
import { EditorCheckbox, EditorPanel, EditorSelect, EditorStatusPill, LoadErrorState, Notice, useDevShortcuts, useScrollToDetail, type DevShortcut, type NoticeMessage } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { GlossaryRendering } from "@server/translation/glossaryConflicts";
import { INBOX_CHECK_LABEL, INBOX_PAGE_SIZE, INBOX_REASON_LABEL, INBOX_SCOPE_LABEL, type InboxItem, type InboxReason, type InboxResponse, type InboxScope } from "@server/translation/reviewInboxTypes";
import { describeWriteRefusal, kindLabel } from "./glossaryModel";
import {
  acceptInboxItem,
  fetchInbox,
  glossaryConflictsOf,
  inboxItemKey,
  markFineHere,
  readShortcutsEnabled,
  readSkipped,
  writeShortcutsEnabled,
  writeSkipped,
} from "./reviewInboxModel";
import { BackToList, KeyCap, PaneDock, RowSkeletons } from "./workbenchParts";

/** How long a keyboard accept waits, with Undo on screen, before it writes. */
export const UNDO_WINDOW_MS = 10_000;

const REASON_TONE: Partial<Record<InboxReason, "info" | "warning" | "danger">> = {
  "segment-rejected": "danger",
  "glossary-never-checked": "info",
  "reader-suggestion": "info",
};
const SCOPE_ICON: Record<InboxScope, IconName> = {
  glossary: "lucide:book-a",
  ui: "lucide:panels-top-left",
  narrative: "lucide:file-text",
  segment: "lucide:languages",
  feedback: "lucide:message-square-text",
  note: "lucide:sticky-note",
  model: "lucide:sparkles",
};
const acceptLabel = (item: InboxItem) => (item.accept?.kind === "feedback-resolve" ? "Resolve" : item.accept?.kind === "suggestion-accept" ? "Accept as draft" : "Accept");
/** What Accept does to this item, in one sentence under the dock's buttons. */
const acceptMeans = (item: InboxItem) => {
  switch (item.accept?.kind) {
    case "glossary-confirm": return "Accept records that you checked this wording as readers see it. Nothing on the site changes.";
    case "ui-approve": return "Accept approves the wording readers see now for the changed English. It ships with the next site release.";
    case "narrative-approve": return "Accept approves the wording readers see now for this sentence.";
    case "feedback-resolve": return "Resolve closes the reader's suggestion. To use their wording, Edit the term first.";
    case "suggestion-accept": return "Accept as draft saves the model's sentence as a Fluency draft in Articles. It never approves.";
    default: return item.exception ? "Nothing to accept here. Mark it fine here, or Edit the wording." : "Nothing to accept here. Edit opens the place to fix it.";
  }
};
const acceptedMessage = (item: InboxItem) =>
  item.accept?.kind === "feedback-resolve" ? `Resolved the suggestion on "${item.english}".`
    : item.accept?.kind === "suggestion-accept" ? "Saved as a Fluency draft. Review and approve it in Articles; published wording is unchanged."
      : `Accepted "${item.english}".`;
/** Where an item lives, in words: a glossary kind reads as its label, anything else as the server wrote it. */
const whereOf = (item: InboxItem) => (item.scope === "glossary" ? kindLabel(item.where) : item.where);

type ReviewInboxProps = {
  locale: string;
  /** Opens an item's editor; defaults to navigating to its deep link. */
  onOpen?: (href: string) => void;
  /** Every item waiting across pages, for the view's tab; null until the first read lands. */
  onTotalChange?: (total: number | null) => void;
  /** The Inbox is the view on screen, so its keys belong in the `?` sheet. */
  active?: boolean;
};

const openHref = (href: string) => window.location.assign(href);

/** The Inbox's single keys, for the shell's `?` sheet; listed only while they are on. */
const REVIEW_INBOX_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "j / k", label: "Next and previous item in the Inbox" },
  { keys: "a", label: "Accept, with 10 seconds to undo" },
  { keys: "u", label: "Undo the accept" },
  { keys: "e", label: "Edit the item" },
  { keys: "f", label: "Fine here" },
  { keys: "s", label: "Skip" },
];

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function ReviewInbox({ locale, onOpen = openHref, onTotalChange, active = true }: ReviewInboxProps) {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reason, setReason] = useState<InboxReason | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readSkipped(locale)));
  const [focusIndex, setFocusIndex] = useState(0);
  /** The item a tap picked, which scrolls the pane in on a phone; the automatic first item never does. */
  const [picked, setPicked] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  /** The approved renderings the last Accept left out, for the item it named. */
  const [glossaryConflict, setGlossaryConflict] = useState<{ key: string; conflicts: GlossaryRendering[] } | null>(null);
  const [shortcutsOn, setShortcutsOn] = useState(() => (typeof window === "undefined" ? true : readShortcutsEnabled()));
  useDevShortcuts(REVIEW_INBOX_SHORTCUTS, shortcutsOn && active);
  /** The keyboard accept waiting out its undo window; nothing is written for it yet. */
  const [undoable, setUndoable] = useState<InboxItem | null>(null);
  const undoableRef = useRef<{ item: InboxItem; timer: number } | null>(null);
  /** Items a keyboard accept took out of the list: waiting to be written, or being written. A failed write puts them back. */
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  /** Writes run one after another, so a scheduled accept never races an earlier one. */
  const writes = useRef<Promise<void>>(Promise.resolve());
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  /** Set when a key or action moved focus, so the next render moves the DOM focus too. */
  const focusPending = useRef(false);

  const load = useCallback(async (at: number, only: InboxReason | null) => {
    setError(null);
    setLoading(true);
    try {
      setData(await fetchInbox(locale, at, only));
      setOffset(at);
      setReason(only);
      setFocusIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the inbox.");
    } finally {
      setLoading(false);
    }
  }, [locale]);
  useEffect(() => { void load(0, null); }, [load]);

  const visible = useMemo(() => data?.items.filter((item) => !skipped.has(inboxItemKey(item)) && !held.has(inboxItemKey(item))) ?? [], [data, skipped, held]);
  const current = Math.min(focusIndex, Math.max(visible.length - 1, 0));
  const item = visible[current] ?? null;
  const everything = data ? Object.values(data.counts).reduce((sum, count) => sum + (count ?? 0), 0) : null;
  useEffect(() => { onTotalChange?.(data ? (reason ? everything : data.total) : null); }, [data, everything, onTotalChange, reason]);
  useScrollToDetail(paneRef, picked);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    itemRefs.current[current]?.focus();
  }, [current, visible]);

  const moveTo = (index: number) => {
    focusPending.current = true;
    setFocusIndex(Math.max(0, Math.min(index, visible.length - 1)));
  };

  const release = (key: string) => setHeld((prev) => {
    if (!prev.has(key)) return prev;
    const next = new Set(prev);
    next.delete(key);
    return next;
  });

  /**
   * Runs one write for an item; on success the item leaves the list. A button
   * or key write keeps focus at the item's place, which is now the next item;
   * a scheduled accept (`scheduled`) leaves focus wherever the reviewer is now,
   * and on failure puts its item back with the reason.
   */
  const act = (target: InboxItem, write: () => Promise<void>, done: string, scheduled = false) => {
    if (accepting && !scheduled) return;
    const key = inboxItemKey(target);
    const run = async () => {
      setAccepting(key);
      setNotice(null);
      setGlossaryConflict(null);
      try {
        await write();
        if (!scheduled) focusPending.current = true;
        setData((prev) => prev && {
          ...prev,
          items: prev.items.filter((other) => inboxItemKey(other) !== key),
          total: Math.max(prev.total - 1, 0),
          counts: { ...prev.counts, [target.reason]: Math.max((prev.counts[target.reason] ?? 1) - 1, 0) },
        });
        setNotice({ tone: "success", message: done });
      } catch (cause) {
        const conflicts = glossaryConflictsOf(cause);
        if (conflicts?.length) {
          setGlossaryConflict({ key, conflicts });
          return;
        }
        const refusal = describeWriteRefusal(cause, "The change did not go through. Reload the inbox and review the latest revision.");
        setNotice({ tone: "danger", message: refusal.message });
      } finally {
        release(key);
        setAccepting(null);
      }
    };
    writes.current = writes.current.then(run, run);
    return writes.current;
  };
  const accept = (target: InboxItem, glossaryExceptions: readonly string[] = [], scheduled = false) => {
    const how = target.accept;
    if (!how) return;
    void act(target, () => acceptInboxItem(locale, how, glossaryExceptions), acceptedMessage(target), scheduled);
  };

  /** Writes the accept waiting out its undo window now: when the window ends, when another accept is scheduled, or when the Inbox closes. */
  const commitUndoable = () => {
    const waiting = undoableRef.current;
    if (!waiting) return;
    window.clearTimeout(waiting.timer);
    undoableRef.current = null;
    setUndoable(null);
    accept(waiting.item, [], true);
  };
  const commitRef = useRef(commitUndoable);
  useEffect(() => {
    commitRef.current = commitUndoable;
  });
  // Leaving the Inbox keeps a scheduled accept: the reviewer asked for it and did not undo.
  useEffect(() => () => commitRef.current(), []);

  /** A: the item leaves the list at once, and the write waits 10 seconds with Undo on screen. */
  const scheduleAccept = (target: InboxItem) => {
    if (!target.accept) return;
    commitUndoable();
    const key = inboxItemKey(target);
    focusPending.current = true;
    setHeld((prev) => new Set(prev).add(key));
    setNotice(null);
    setGlossaryConflict(null);
    undoableRef.current = { item: target, timer: window.setTimeout(() => commitRef.current(), UNDO_WINDOW_MS) };
    setUndoable(target);
  };
  const undoAccept = () => {
    const waiting = undoableRef.current;
    if (!waiting) return;
    window.clearTimeout(waiting.timer);
    undoableRef.current = null;
    setUndoable(null);
    const key = inboxItemKey(waiting.item);
    release(key);
    // Focus returns to the item the undo brought back.
    const index = (data?.items ?? []).filter((other) => !skipped.has(inboxItemKey(other)) && (inboxItemKey(other) === key || !held.has(inboxItemKey(other)))).findIndex((other) => inboxItemKey(other) === key);
    if (index >= 0) {
      focusPending.current = true;
      setFocusIndex(index);
    }
    setNotice({ tone: "neutral", message: `Undone. "${waiting.item.english}" was not accepted.` });
  };

  const toggleShortcuts = (on: boolean) => {
    setShortcutsOn(on);
    writeShortcutsEnabled(on);
  };
  const fineHere = (target: InboxItem) => {
    const exception = target.exception;
    if (!exception) return;
    void act(target, () => markFineHere(locale, exception), "Marked fine here. It comes back if the English, the term's translation, or this translation changes.");
  };

  const skip = (target: InboxItem) => {
    focusPending.current = true;
    setSkipped((prev) => {
      const next = new Set(prev).add(inboxItemKey(target));
      writeSkipped(locale, next);
      return next;
    });
  };

  const showSkipped = () => {
    const none = new Set<string>();
    writeSkipped(locale, none);
    setSkipped(none);
  };

  const pick = (index: number, key: string) => {
    setFocusIndex(index);
    setPicked(key);
  };
  const backToList = () => {
    listRef.current?.scrollIntoView({ block: "start" });
    itemRefs.current[current]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!shortcutsOn || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
    const target = visible[current];
    const key = event.key.toLowerCase();
    if (key === "j") moveTo(current + 1);
    else if (key === "k") moveTo(current - 1);
    else if (key === "a" && target?.accept && !event.repeat) scheduleAccept(target);
    else if (key === "u" && undoable) undoAccept();
    else if (key === "e" && target) onOpen(target.href);
    else if (key === "f" && target?.exception) fineHere(target);
    else if (key === "s" && target) skip(target);
    else return;
    event.preventDefault();
  };

  const skippedHere = data ? data.items.filter((entry) => skipped.has(inboxItemKey(entry))).length : 0;
  const allClear = data !== null && data.total === 0 && !reason;
  const conflicts = item && glossaryConflict?.key === inboxItemKey(item) ? glossaryConflict.conflicts : null;
  const busyHere = accepting !== null;

  // Always mounted, before the first message, so every notice and the undo offer are announced; it sits in the dock.
  const liveRegion = (
    <div role="status" aria-live="polite" aria-label="Inbox messages" className="space-y-2 empty:hidden">
      {undoable ? (
        <Notice
          tone="info" placement="inline" message={`Accepting "${undoable.english}" in 10 seconds.`} actions={<Button type="button" variant="outline" size="sm" aria-keyshortcuts="u" onClick={undoAccept}>Undo<KeyCap>u</KeyCap></Button>}
        />
      ) : null}
      {notice ? <Notice {...notice} placement="inline" dismiss={() => setNotice(null)} /> : null}
    </div>
  );

  let paneBody: ReactNode;
  if (error) {
    paneBody = <div className="p-4 sm:p-5"><LoadErrorState what="the inbox" message={error} onRetry={() => void load(offset, reason)} busy={loading} /></div>;
  } else if (!data) {
    paneBody = <div className="p-4 sm:p-5"><RowSkeletons rows={2} label="the inbox" /></div>;
  } else if (allClear) {
    paneBody = (
      <div className="space-y-3 px-4 py-6 sm:px-5">
        <p className="theme-text-primary flex items-center gap-2 text-base font-semibold"><Icon icon="lucide:check-check" size={18} className="text-[color:var(--theme-success-text)]" />All clear</p>
        <p className="theme-text-secondary text-sm">Nothing needs a person right now. New findings, reader suggestions and changed English land here.</p>
        <details className="theme-text-muted text-xs">
          <summary className="cursor-pointer select-none">What was checked</summary>
          <p className="mt-1 max-w-prose">Checked {data.checked.map((check) => INBOX_CHECK_LABEL[check]).join(", ")}.</p>
        </details>
      </div>
    );
  } else if (item) {
    paneBody = <InboxItemDetail item={item} locale={locale} position={{ index: current, total: visible.length }} onMove={(delta) => moveTo(current + delta)} onBack={backToList} />;
  } else {
    paneBody = (
      <div className="space-y-3 px-4 py-6 sm:px-5">
        <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
          <Icon icon="lucide:languages" size={18} className="theme-icon-accent shrink-0" />
          Pick an item to review it here
        </p>
        <p className="theme-text-muted max-w-[62ch] text-sm">
          It opens with the English beside what readers see now, and Accept, Fine here, Edit and Skip in the dock.
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- J/K/A/U/E/F/S shortcuts for the roving-focus list; every action also has a button.
    <section aria-label="Review inbox" className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)] lg:items-start xl:gap-8" onKeyDown={onKeyDown}>
      <section ref={listRef} aria-labelledby={`inbox-list-${locale}`} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`inbox-list-${locale}`} className="type-meta-label theme-text-muted">Waiting</h3>
          <div className="flex items-center gap-1">
            <p className="theme-text-muted text-xs tabular-nums" data-testid="inbox-summary">
              {!data ? "Loading" : data.total === 0 ? "No items" : `${data.total} ${data.total === 1 ? "item needs" : "items need"} a person`}
              {data && data.total > INBOX_PAGE_SIZE ? ` · showing ${offset + 1} to ${offset + data.items.length}` : ""}
              {skippedHere > 0 ? ` · ${skippedHere} skipped this session` : ""}
            </p>
            <Button type="button" variant="ghost" size="icon" className="-mr-2 size-8" aria-label="Reload inbox" title="Reload inbox" disabled={loading} aria-busy={loading || undefined} onClick={() => void load(offset, reason)}>
              <Icon icon="lucide:refresh-cw" size={14} className={loading ? "motion-safe:animate-spin" : undefined} />
            </Button>
          </div>
        </div>
        {data && !allClear ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor={`inbox-reason-${locale}`} className="theme-text-secondary block text-xs font-medium">Reason</label>
              <EditorSelect
                id={`inbox-reason-${locale}`}
                aria-label="Show items listed for"
                selectSize="sm"
                value={reason ?? ""}
                onChange={(event) => void load(0, (event.target.value || null) as InboxReason | null)}
                options={[
                  { value: "", label: `Every reason (${everything})` },
                  ...data.checked.map((check) => ({ value: check, label: `${INBOX_REASON_LABEL[check]} (${data.counts[check] ?? 0})` })),
                ]}
              />
            </div>
            {skippedHere > 0 ? <Button type="button" variant="ghost" size="sm" onClick={showSkipped}>Show skipped</Button> : null}
          </div>
        ) : null}

        {!data && !error ? <RowSkeletons rows={5} label="the inbox" /> : null}
        {data && data.total === 0 && reason ? (
          <StateCard compact tone="neutral" icon="lucide:inbox" title={`Nothing listed for "${INBOX_REASON_LABEL[reason]}"`} description={`Checked ${INBOX_CHECK_LABEL[reason]}.`} actions={<Button variant="outline" size="sm" onClick={() => void load(0, null)}>Show every reason</Button>} />
        ) : data && data.total === 0 ? (
          <StateCard compact tone="success" icon="lucide:check-check" title="Nothing needs a person right now" description="The pane lists what was checked." />
        ) : data && visible.length === 0 && held.size > 0 && skippedHere === 0 ? null : data && visible.length === 0 ? (
          <StateCard compact tone="neutral" icon="lucide:inbox" title="Everything on this page is skipped" description="Skips last for this browser session." actions={<Button variant="outline" size="sm" onClick={showSkipped}>Show skipped</Button>} />
        ) : data ? (
          <ul aria-label="Items that need a person" className="theme-dev-link-list -mx-2.5 max-h-[min(calc(100dvh-16rem),720px)] overflow-y-auto overscroll-contain lg:pr-1">
            {visible.map((entry, index) => {
              const key = inboxItemKey(entry);
              const selected = index === current;
              return (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- focus tracks the roving item the shortcuts act on; a click picks it.
                <li key={key} tabIndex={selected ? 0 : -1}
                  ref={(element) => { itemRefs.current[index] = element; }}
                  aria-current={selected ? "true" : undefined}
                  aria-label={`${INBOX_SCOPE_LABEL[entry.scope]}: ${entry.english}`}
                  data-inbox-item={key}
                  onFocus={() => setFocusIndex(index)}
                  onClick={() => pick(index, key)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(index, key); } }}
                  className={cn("theme-dev-link-row cursor-pointer space-y-1 rounded-control px-2.5 py-2.5", selected && "theme-dev-link-lead", focusRingClassName)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon icon={SCOPE_ICON[entry.scope]} size={13} className="theme-text-faint shrink-0" />
                    <span className="theme-text-muted shrink-0 text-xs">{INBOX_SCOPE_LABEL[entry.scope]}</span>
                    <EditorStatusPill tone={REASON_TONE[entry.reason] ?? "warning"} inline>{INBOX_REASON_LABEL[entry.reason]}</EditorStatusPill>
                  </div>
                  <p className="theme-text-primary line-clamp-2 break-words text-sm">{entry.english}</p>
                  {entry.detail ? <p className="theme-text-muted line-clamp-1 break-words text-xs">{entry.detail}</p> : <p className="theme-text-faint truncate text-xs">{whereOf(entry)}</p>}
                </li>
              );
            })}
          </ul>
        ) : null}

        {data && data.total > INBOX_PAGE_SIZE ? (
          <nav className="flex flex-wrap items-center gap-2" aria-label="Inbox pages">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => void load(offset - INBOX_PAGE_SIZE, reason)}>Previous items</Button>
            <Button variant="outline" size="sm" disabled={offset + INBOX_PAGE_SIZE >= data.total} onClick={() => void load(offset + INBOX_PAGE_SIZE, reason)}>Next items</Button>
          </nav>
        ) : null}

        {data && !allClear ? (
          <div className="space-y-1 pt-1">
            <EditorCheckbox label="Single-key shortcuts" checked={shortcutsOn} onChange={(event) => toggleShortcuts(event.target.checked)} />
            {shortcutsOn ? (
              <p className="theme-text-faint text-xs [@media(pointer:coarse)]:hidden">
                <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move, the dock shows each decision&apos;s key, <kbd className="theme-dev-kbd">?</kbd> lists them all.
              </p>
            ) : (
              <p className="theme-text-faint text-xs">Letter keys do nothing here; use the buttons.</p>
            )}
          </div>
        ) : null}
      </section>

      <section ref={paneRef} aria-label={item ? `Review: ${item.english}` : "Review"} className={cn("min-w-0 scroll-mt-24 lg:sticky lg:top-24", !picked && !notice && !undoable && "max-lg:hidden")}>
        <EditorPanel className="overflow-visible">
          {paneBody}
          <PaneDock label="Decision">
            {liveRegion}
            {item && conflicts ? (
              <div role="status" className="theme-text-secondary space-y-2 text-sm">
                <p>This wording leaves out {conflicts.map(({ term, target }) => `${term} (${target})`).join(", ")} from the glossary.</p>
                <Button type="button" variant="outline" size="sm" disabled={busyHere} aria-label={`Fine here: accept without ${conflicts.map(({ term }) => term).join(", ")}`} onClick={() => accept(item, conflicts.map(({ term }) => term))}>Fine here</Button>
              </div>
            ) : null}
            {item ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {item.accept ? (
                    <Button type="button" variant="accent" size="sm" disabled={busyHere} aria-keyshortcuts="a" aria-busy={accepting === inboxItemKey(item) || undefined} onClick={() => accept(item)}>
                      {accepting === inboxItemKey(item) ? "Saving" : acceptLabel(item)}
                      {shortcutsOn ? <KeyCap>a</KeyCap> : null}
                    </Button>
                  ) : null}
                  {item.exception ? (
                    <Button type="button" variant={item.accept ? "outline" : "accent"} size="sm" disabled={busyHere} aria-keyshortcuts="f" onClick={() => fineHere(item)}>
                      Fine here{shortcutsOn ? <KeyCap>f</KeyCap> : null}
                    </Button>
                  ) : null}
                  <Button asChild variant={item.accept || item.exception ? "outline" : "accent"} size="sm">
                    <a href={item.href} aria-keyshortcuts="e" onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); onOpen(item.href); } }}>
                      Edit{shortcutsOn ? <KeyCap>e</KeyCap> : null}
                    </a>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" aria-keyshortcuts="s" onClick={() => skip(item)}>
                    Skip{shortcutsOn ? <KeyCap>s</KeyCap> : null}
                  </Button>
                </div>
                <p className="theme-text-muted text-xs">{acceptMeans(item)}</p>
              </>
            ) : null}
          </PaneDock>
        </EditorPanel>
      </section>
    </section>
  );
}

/** The item under review: where it lives, why it is listed, the English and the wording readers see, and what the check found. */
function InboxItemDetail({ item, locale, position, onMove, onBack }: {
  item: InboxItem;
  locale: string;
  position: { index: number; total: number };
  onMove: (delta: number) => void;
  onBack: () => void;
}) {
  const pager = (
    <div className="flex items-center gap-1">
      <span className="theme-text-muted px-1 text-xs tabular-nums">{position.index + 1} of {position.total}</span>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Previous item" aria-keyshortcuts="k" title="Previous item (k)" disabled={position.index <= 0} onClick={() => onMove(-1)}>
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Next item" aria-keyshortcuts="j" title="Next item (j)" disabled={position.index >= position.total - 1} onClick={() => onMove(1)}>
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  );
  return (
    <>
      <header className="theme-portal-rule space-y-3 border-b px-4 py-3.5 sm:px-5">
        <BackToList onBack={onBack}>{pager}</BackToList>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="theme-text-muted flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
            <Icon icon={SCOPE_ICON[item.scope]} size={14} className="theme-text-faint shrink-0" />
            <span className="theme-text-secondary font-medium">{INBOX_SCOPE_LABEL[item.scope]}</span>
            <span aria-hidden>·</span>
            <span className="break-words">{whereOf(item)}</span>
            <EditorStatusPill tone={REASON_TONE[item.reason] ?? "warning"} inline>{INBOX_REASON_LABEL[item.reason]}</EditorStatusPill>
          </div>
          <span className="hidden lg:contents">{pager}</span>
        </div>
      </header>
      <dl className="grid gap-x-6 gap-y-4 px-4 py-5 text-sm sm:px-5 md:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <dt className="type-meta-label theme-text-muted">English</dt>
          <dd lang="en" className="theme-text-primary whitespace-pre-wrap break-words text-base leading-relaxed">{item.english}</dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="type-meta-label theme-text-muted">Readers see</dt>
          <dd lang={item.live ? locale : undefined} dir="auto" className="theme-text-primary whitespace-pre-wrap break-words text-base leading-relaxed">{item.live ?? <span lang="en" className="theme-text-faint">English (not translated yet)</span>}</dd>
        </div>
        {item.previous ? (
          <div className="min-w-0 space-y-1 md:col-span-2">
            <dt className="type-meta-label theme-text-muted">Approved for</dt>
            <dd className="theme-text-secondary whitespace-pre-wrap break-words">
              <span lang="en">{item.previous.english}</span>
              <span className="theme-text-faint"> approved as </span>
              <span lang={locale} dir="auto">{item.previous.target}</span>
            </dd>
          </div>
        ) : null}
        {item.suggestion ? (
          <div className="min-w-0 space-y-1 md:col-span-2">
            <dt className="type-meta-label theme-text-muted">Suggestion</dt>
            <dd lang={locale} dir="auto" className="theme-text-primary whitespace-pre-wrap break-words rounded-control bg-[var(--editor-panel-bg-subtle)] px-3 py-2 text-base">{item.suggestion}</dd>
          </div>
        ) : null}
        {item.detail ? (
          <div className="min-w-0 space-y-1 md:col-span-2">
            <dt className="type-meta-label theme-text-muted">Found</dt>
            <dd className="theme-text-secondary whitespace-pre-wrap break-words">{item.detail}</dd>
          </div>
        ) : null}
        {item.origin ? (
          <div className="min-w-0 space-y-1">
            <dt className="type-meta-label theme-text-muted">Written by</dt>
            <dd className="theme-text-secondary break-words" title={`${item.origin.model} · run ${item.origin.runId.slice(0, 8)} · prompt ${item.origin.promptVersion}`}>Machine</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}
