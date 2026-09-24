"use client";

/**
 * Review Inbox: one list of everything in a locale that needs a person, across
 * the glossary, UI label, and article scopes. Self-contained (it takes only a
 * locale), so the workbench layout can move it without rewiring.
 *
 * Accept calls the existing confirm, save-and-approve, or feedback resolve
 * mutation with the revision shown; Edit opens that item's existing editor;
 * Fine here records a durable exception for a QA finding; Skip hides the item
 * for this browser session. Keys: J and K move, A accepts, E edits, F marks
 * fine, S skips. When Accept leaves out an approved glossary rendering, the
 * item shows the term with its own "Fine here" choice, which resends the save
 * with that term as a glossary exception.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { focusRingClassName, Surface } from "@/components/ui/surface";
import { StateCard } from "@/components/common/StateCard";
import { EditorNotice, EditorSelect, EditorStatusPill, type EditorNoticeMessage } from "@/features/dev/components";
import { INBOX_CHECK_LABEL, INBOX_PAGE_SIZE, INBOX_REASON_LABEL, INBOX_SCOPE_LABEL, type InboxItem, type InboxReason, type InboxResponse } from "../../../../../lib/translation/reviewInboxTypes";
import type { GlossaryRendering } from "@lib/translation/glossaryConflicts";
import { acceptInboxItem, fetchInbox, glossaryConflictsOf, inboxItemKey, markFineHere, readSkipped, writeSkipped } from "./reviewInboxModel";

const REASON_TONE: Partial<Record<InboxReason, "info" | "warning" | "danger">> = {
  "segment-rejected": "danger",
  "glossary-never-checked": "info",
  "reader-suggestion": "info",
};
const acceptLabel = (item: InboxItem) => (item.accept?.kind === "feedback-resolve" ? "Resolve" : item.accept?.kind === "suggestion-accept" ? "Accept as draft" : "Accept");
const acceptedMessage = (item: InboxItem) =>
  item.accept?.kind === "feedback-resolve" ? `Resolved the suggestion on "${item.english}".`
    : item.accept?.kind === "suggestion-accept" ? "Saved as a Fluency draft. Review and approve it in Articles; published wording is unchanged."
      : `Accepted "${item.english}".`;

type ReviewInboxProps = {
  locale: string;
  /** Opens an item's editor; defaults to navigating to its deep link. */
  onOpen?: (href: string) => void;
};

const openHref = (href: string) => window.location.assign(href);

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function ReviewInbox({ locale, onOpen = openHref }: ReviewInboxProps) {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [reason, setReason] = useState<InboxReason | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readSkipped(locale)));
  const [focusIndex, setFocusIndex] = useState(0);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  /** The approved renderings the last Accept left out, for the item it named. */
  const [glossaryConflict, setGlossaryConflict] = useState<{ key: string; conflicts: GlossaryRendering[] } | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  /** Set when a key or action moved focus, so the next render moves the DOM focus too. */
  const focusPending = useRef(false);

  const load = useCallback(async (at: number, only: InboxReason | null) => {
    setError(null);
    try {
      setData(await fetchInbox(locale, at, only));
      setOffset(at);
      setReason(only);
      setFocusIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the inbox.");
    }
  }, [locale]);
  useEffect(() => { void load(0, null); }, [load]);

  const visible = useMemo(() => data?.items.filter((item) => !skipped.has(inboxItemKey(item))) ?? [], [data, skipped]);
  const current = Math.min(focusIndex, Math.max(visible.length - 1, 0));

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    itemRefs.current[current]?.focus();
  }, [current, visible]);

  const moveTo = (index: number) => {
    focusPending.current = true;
    setFocusIndex(Math.max(0, Math.min(index, visible.length - 1)));
  };

  /** Runs one write for an item; on success the item leaves the list and focus stays at its place, which is now the next item. */
  const act = async (item: InboxItem, write: () => Promise<void>, done: string) => {
    if (accepting) return;
    const key = inboxItemKey(item);
    setAccepting(key);
    setNotice(null);
    setGlossaryConflict(null);
    try {
      await write();
      focusPending.current = true;
      setData((prev) => prev && {
        ...prev,
        items: prev.items.filter((other) => inboxItemKey(other) !== key),
        total: Math.max(prev.total - 1, 0),
        counts: { ...prev.counts, [item.reason]: Math.max((prev.counts[item.reason] ?? 1) - 1, 0) },
      });
      setNotice({ tone: "success", message: done });
    } catch (cause) {
      const conflicts = glossaryConflictsOf(cause);
      if (conflicts?.length) {
        setGlossaryConflict({ key, conflicts });
        return;
      }
      setNotice({ tone: "danger", message: cause instanceof Error ? cause.message : "The change did not go through. Reload the inbox and review the latest revision." });
    } finally {
      setAccepting(null);
    }
  };
  const accept = (item: InboxItem, glossaryExceptions: readonly string[] = []) => {
    const target = item.accept;
    if (!target) return;
    void act(item, () => acceptInboxItem(locale, target, glossaryExceptions), acceptedMessage(item));
  };
  const fineHere = (item: InboxItem) => {
    const exception = item.exception;
    if (!exception) return;
    void act(item, () => markFineHere(locale, exception), "Marked fine here. It comes back if the English, the term's translation, or this translation changes.");
  };

  const skip = (item: InboxItem) => {
    focusPending.current = true;
    setSkipped((prev) => {
      const next = new Set(prev).add(inboxItemKey(item));
      writeSkipped(locale, next);
      return next;
    });
  };

  const showSkipped = () => {
    const none = new Set<string>();
    writeSkipped(locale, none);
    setSkipped(none);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
    const item = visible[current];
    const key = event.key.toLowerCase();
    if (key === "j") moveTo(current + 1);
    else if (key === "k") moveTo(current - 1);
    else if (key === "a" && item) void accept(item);
    else if (key === "e" && item) onOpen(item.href);
    else if (key === "f" && item?.exception) fineHere(item);
    else if (key === "s" && item) skip(item);
    else return;
    event.preventDefault();
  };

  if (error) return <StateCard compact tone="danger" title="The inbox could not be loaded" description={error} actions={<Button variant="outline" size="sm" onClick={() => void load(offset, reason)}>Retry</Button>} />;
  if (!data) return <StateCard compact loading title="Loading the inbox" />;

  const checked = data.checked.map((check) => INBOX_CHECK_LABEL[check]);
  const skippedHere = data.items.length - visible.length;
  const everything = Object.values(data.counts).reduce((sum, count) => sum + (count ?? 0), 0);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- J/K/A/E/F/S shortcuts for the roving-focus list; every action also has a button.
    <section aria-label="Review inbox" className="space-y-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="theme-text-secondary text-sm" data-testid="inbox-summary">
          {data.total === 0 ? "No items" : `${data.total} ${data.total === 1 ? "item needs" : "items need"} a person`}
          {data.total > INBOX_PAGE_SIZE ? ` · showing ${offset + 1} to ${offset + data.items.length}` : ""}
          {skippedHere > 0 ? ` · ${skippedHere} skipped this session` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <EditorSelect
            aria-label="Show items listed for"
            selectSize="sm"
            value={reason ?? ""}
            onChange={(event) => void load(0, (event.target.value || null) as InboxReason | null)}
            options={[
              { value: "", label: `Every reason (${everything})` },
              ...data.checked.map((check) => ({ value: check, label: `${INBOX_REASON_LABEL[check]} (${data.counts[check] ?? 0})` })),
            ]}
          />
          <span className="theme-text-faint text-xs">J / K move · A accept · E edit · F fine here · S skip</span>
          {skippedHere > 0 ? <Button type="button" variant="ghost" size="sm" onClick={showSkipped}>Show skipped</Button> : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void load(offset, reason)}>Reload inbox</Button>
        </div>
      </div>
      {notice ? <EditorNotice notice={notice} /> : null}

      {data.total === 0 && reason ? (
        <StateCard compact tone="neutral" icon="lucide:inbox" title={`Nothing listed for "${INBOX_REASON_LABEL[reason]}"`} description={`Checked ${INBOX_CHECK_LABEL[reason]}.`} actions={<Button variant="outline" size="sm" onClick={() => void load(0, null)}>Show every reason</Button>} />
      ) : data.total === 0 ? (
        <StateCard compact tone="success" icon="lucide:check-check" title="Nothing needs a person right now" description={`Checked ${checked.join(", ")}.`} />
      ) : visible.length === 0 ? (
        <StateCard compact tone="neutral" icon="lucide:inbox" title="Everything on this page is skipped" description="Skips last for this browser session." actions={<Button variant="outline" size="sm" onClick={showSkipped}>Show skipped</Button>} />
      ) : (
        <ul aria-label="Items that need a person" className="space-y-2">
          {visible.map((item, index) => {
            const key = inboxItemKey(item);
            const conflicts = glossaryConflict?.key === key ? glossaryConflict.conflicts : null;
            return (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- focus tracks the roving item the shortcuts act on.
              <li
                key={key}
                ref={(element) => { itemRefs.current[index] = element; }}
                tabIndex={index === current ? 0 : -1}
                aria-current={index === current ? "true" : undefined}
                aria-label={`${INBOX_SCOPE_LABEL[item.scope]}: ${item.english}`}
                data-inbox-item={key}
                onFocus={() => setFocusIndex(index)}
                className={`rounded-card ${focusRingClassName}`}
              >
                <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <EditorStatusPill tone="neutral">{INBOX_SCOPE_LABEL[item.scope]}</EditorStatusPill>
                    <EditorStatusPill tone={REASON_TONE[item.reason] ?? "warning"}>{INBOX_REASON_LABEL[item.reason]}</EditorStatusPill>
                    <span className="theme-text-faint break-words text-xs">{item.where}</span>
                  </div>
                  <dl className="grid gap-1 text-sm md:grid-cols-[8rem_1fr]">
                    <dt className="theme-text-faint">English</dt>
                    <dd className="theme-text-primary whitespace-pre-wrap break-words">{item.english}</dd>
                    <dt className="theme-text-faint">Readers see</dt>
                    <dd lang={item.live ? locale : undefined} dir="auto" className="theme-text-primary whitespace-pre-wrap break-words">{item.live ?? <span lang="en" className="theme-text-faint">English (not translated yet)</span>}</dd>
                    {item.previous ? <>
                      <dt className="theme-text-faint">Approved for</dt>
                      <dd className="theme-text-secondary whitespace-pre-wrap break-words">{item.previous.english} → {item.previous.target}</dd>
                    </> : null}
                    {item.suggestion ? <>
                      <dt className="theme-text-faint">Suggestion</dt>
                      <dd lang={locale} dir="auto" className="theme-text-primary whitespace-pre-wrap break-words">{item.suggestion}</dd>
                    </> : null}
                    {item.origin ? <>
                      <dt className="theme-text-faint">Written by</dt>
                      <dd className="theme-text-secondary break-words" title={`${item.origin.model} · run ${item.origin.runId.slice(0, 8)} · prompt ${item.origin.promptVersion}`}>Machine</dd>
                    </> : null}
                    {item.detail ? <>
                      <dt className="theme-text-faint">Found</dt>
                      <dd className="theme-text-secondary whitespace-pre-wrap break-words">{item.detail}</dd>
                    </> : null}
                  </dl>
                  {conflicts ? <div role="status" className="theme-text-secondary flex flex-wrap items-center gap-2 text-sm">
                    <span>This wording leaves out {conflicts.map(({ term, target }) => `${term} (${target})`).join(", ")} from the glossary.</span>
                    <Button type="button" variant="outline" size="sm" disabled={accepting !== null} aria-label={`Fine here: accept without ${conflicts.map(({ term }) => term).join(", ")}`} onClick={() => accept(item, conflicts.map(({ term }) => term))}>Fine here</Button>
                  </div> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="accent" size="sm" disabled={!item.accept || accepting !== null} onClick={() => accept(item)}>
                      {accepting === key ? "Saving" : acceptLabel(item)}
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={item.href} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); onOpen(item.href); } }}>Edit</a>
                    </Button>
                    {item.exception ? <Button type="button" variant="outline" size="sm" disabled={accepting !== null} onClick={() => fineHere(item)}>Fine here</Button> : null}
                    <Button type="button" variant="ghost" size="sm" onClick={() => skip(item)}>Skip</Button>
                    {item.accept || item.exception ? null : <span className="theme-text-faint text-xs">Nothing to accept here; use Edit.</span>}
                  </div>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}

      {data.total > INBOX_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center gap-3" aria-label="Inbox pages">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => void load(offset - INBOX_PAGE_SIZE, reason)}>Previous items</Button>
          <Button variant="outline" size="sm" disabled={offset + INBOX_PAGE_SIZE >= data.total} onClick={() => void load(offset + INBOX_PAGE_SIZE, reason)}>Next items</Button>
        </div>
      ) : null}
    </section>
  );
}
