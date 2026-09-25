import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TriageAction = "accept" | "reject" | "spam" | "note" | "undo";

export interface TriageShortcutHandlers {
  /** `j` (1) and `k` (-1): move the selection to the next or previous item. */
  onMove?: (direction: 1 | -1) => void;
  /** `a`: the queue's positive decision (Accept, Resolve, Approve). */
  onAccept?: () => void;
  /** `r`: reject; the tool still asks before it writes. */
  onReject?: () => void;
  /** `s`: mark as spam; the tool still asks before it writes. */
  onSpam?: () => void;
  /** `n`: put the cursor in the review note. */
  onNote?: () => void;
  /** `u`: undo the last decision. */
  onUndo?: () => void;
  /** What each action is called in this tool, for the `?` list. */
  labels?: Partial<Record<TriageAction | "move", string>>;
  /** False turns every key off, for example while the tool is not showing a queue. */
  enabled?: boolean;
}

const ACTION_KEYS: Record<string, TriageAction> = {
  a: "accept",
  r: "reject",
  s: "spam",
  n: "note",
  u: "undo",
};

const DEFAULT_LABELS: Record<TriageAction | "move", string> = {
  move: "Next and previous item",
  accept: "Accept",
  reject: "Reject",
  spam: "Mark as spam",
  note: "Write a review note",
  undo: "Undo the last decision",
};

const HANDLER_OF: Record<TriageAction, keyof TriageShortcutHandlers> = {
  accept: "onAccept",
  reject: "onReject",
  spam: "onSpam",
  note: "onNote",
  undo: "onUndo",
};

/** True when a key starts in a place where letters are text, not commands. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
}

/** True while any dialog is on screen; its own keys come first. */
function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/** Menus and open popovers (a select's options, a command list) own their letters for typeahead. */
function isInsidePopupWidget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="menu"], [role="menubar"], [data-radix-popper-content-wrapper], [cmdk-root]') !== null
  );
}

/** One quiet line under a queue so the keys can be found; pointer-only screens skip it. */
export function TriageShortcutHint({ className }: { className?: string }) {
  return (
    <p className={`theme-text-faint text-xs [@media(pointer:coarse)]:hidden ${className ?? ""}`}>
      Press <kbd className="font-mono">?</kbd> for keyboard shortcuts.
    </p>
  );
}

/**
 * The single-key triage layer every intake queue shares (Citations, Trip
 * reports, Feedback): `j`/`k` move, `a` accept, `r` reject, `s` spam, `n`
 * note, `u` undo, `?` lists the keys. A key whose handler is omitted is not
 * bound and is not listed.
 *
 * Keys never fire inside a text field, while a dialog is open, with a
 * modifier held, or when another handler already called `preventDefault`.
 * A handled key is marked handled so it never also types into a field the
 * handler focused. Returns the `?` dialog; render it once near the tool root.
 */
export function useTriageShortcuts(handlers: TriageShortcutHandlers): { helpDialog: ReactNode } {
  const [helpOpen, setHelpOpen] = useState(false);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const enabled = handlers.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target) || isInsidePopupWidget(event.target) || isDialogOpen()) return;

      const current = latest.current;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === "j" || event.key === "k") {
        if (!current.onMove) return;
        event.preventDefault();
        current.onMove(event.key === "j" ? 1 : -1);
        return;
      }
      const action = ACTION_KEYS[event.key];
      if (!action || event.repeat) return;
      const handler = current[HANDLER_OF[action]] as (() => void) | undefined;
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  const labels = { ...DEFAULT_LABELS, ...handlers.labels };
  const rows: { keys: string; label: string }[] = [];
  if (handlers.onMove) rows.push({ keys: "j / k", label: labels.move });
  for (const [key, action] of Object.entries(ACTION_KEYS)) {
    if (handlers[HANDLER_OF[action]]) rows.push({ keys: key, label: labels[action] });
  }
  rows.push({ keys: "?", label: "Show these keys" });
  const listKey = rows.map((row) => `${row.keys}:${row.label}`).join("|");

  const helpDialog = useMemo(
    () => (
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm" showClose={false}>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription className="theme-text-muted">
              Keys work anywhere in this queue except inside a text field. Reject and spam still ask first.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {rows.map((row) => (
              <div key={row.keys} className="contents">
                <dt>
                  <kbd className="theme-text-primary rounded border border-current/25 px-1.5 py-0.5 font-mono text-xs">
                    {row.keys}
                  </kbd>
                </dt>
                <dd className="theme-text-secondary">{row.label}</dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHelpOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    // `rows` is rebuilt every render; its text is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [helpOpen, listKey],
  );

  return { helpDialog };
}
