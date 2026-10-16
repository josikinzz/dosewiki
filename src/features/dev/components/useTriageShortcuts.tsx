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
import { isBareCommandKey, isTextEntryTarget, useDevShortcuts } from "./devShortcuts";

export { isTextEntryTarget };

export type TriageAction = "accept" | "reject" | "spam" | "note" | "undo";

export interface TriageShortcutHandlers {
  onMove?: (direction: 1 | -1) => void;
  onAccept?: () => void;
  onReject?: () => void;
  onSpam?: () => void;
  onNote?: () => void;
  onUndo?: () => void;
  labels?: Partial<Record<TriageAction | "move", string>>;
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

export function TriageShortcutHint({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <p className={`theme-text-faint text-xs [@media(pointer:coarse)]:hidden ${className ?? ""}`}>
      {children}
      {children ? ", " : null}
      <kbd className="theme-dev-kbd">?</kbd> every key
    </p>
  );
}

export function useTriageShortcuts(handlers: TriageShortcutHandlers): { helpDialog: ReactNode } {
  const [helpOpen, setHelpOpen] = useState(false);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const enabled = handlers.enabled !== false;

  const labels = { ...DEFAULT_LABELS, ...handlers.labels };
  const rows: { keys: string; label: string }[] = [];
  if (handlers.onMove) rows.push({ keys: "j / k", label: labels.move });
  for (const [key, action] of Object.entries(ACTION_KEYS)) {
    if (handlers[HANDLER_OF[action]]) rows.push({ keys: key, label: labels[action] });
  }
  const inShell = useDevShortcuts(rows, enabled);
  rows.push({ keys: "?", label: "Show these keys" });
  const listKey = rows.map((row) => `${row.keys}:${row.label}`).join("|");

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!isBareCommandKey(event)) return;

      const current = latest.current;
      if (event.key === "?") {
        if (inShell) return;
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
  }, [enabled, inShell]);

  const helpDialog = useMemo(
    () => inShell ? null : (
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [helpOpen, inShell, listKey],
  );

  return { helpDialog };
}
