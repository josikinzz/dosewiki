import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * One key a tool answers to, as the `?` sheet lists it. `keys` is what the
 * editor presses, written the way it reads ("j / k", "Cmd+Z"); `label` says
 * what it does in this tool.
 */
export interface DevShortcut {
  keys: string;
  label: string;
}

interface ShortcutRegistryContext {
  /** Every mounted tool's keys, in registration order. */
  shortcuts: readonly DevShortcut[];
  register: (id: string, shortcuts: readonly DevShortcut[]) => () => void;
}

const DevShortcutContext = createContext<ShortcutRegistryContext | null>(null);

/**
 * Holds the keys the open tool answers to, so the shell's one `?` sheet can
 * list them. Tools register through `useDevShortcuts`; the shell chrome reads
 * the list with `useDevShortcutList` and owns the sheet and the `?` key.
 */
export function DevShortcutsProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef(new Map<string, readonly DevShortcut[]>());
  const [shortcuts, setShortcuts] = useState<readonly DevShortcut[]>([]);
  const publish = useCallback(() => setShortcuts([...entriesRef.current.values()].flat()), []);
  const register = useCallback((id: string, next: readonly DevShortcut[]) => {
    entriesRef.current.set(id, next);
    publish();
    return () => {
      if (entriesRef.current.get(id) === next) {
        entriesRef.current.delete(id);
        publish();
      }
    };
  }, [publish]);
  const value = useMemo(() => ({ shortcuts, register }), [register, shortcuts]);
  return <DevShortcutContext.Provider value={value}>{children}</DevShortcutContext.Provider>;
}

/**
 * Lists `shortcuts` in the shell's `?` sheet while the calling tool is
 * mounted and `enabled` holds. Returns whether a shell is listening, so a hook
 * that also works outside the shell (the triage keys) knows whether it still
 * owes its own help.
 */
export function useDevShortcuts(shortcuts: readonly DevShortcut[], enabled = true): boolean {
  const registry = useContext(DevShortcutContext);
  const id = useId();
  const listKey = shortcuts.map((shortcut) => `${shortcut.keys}\u0000${shortcut.label}`).join("\u0001");
  const register = registry?.register;
  useEffect(() => {
    if (!register || !enabled || listKey === "") return;
    return register(id, listKey.split("\u0001").map((row) => {
      const [keys, label] = row.split("\u0000");
      return { keys, label };
    }));
  }, [enabled, id, listKey, register]);
  return registry !== null;
}

/** The keys every mounted tool registered; empty outside the shell. */
export function useDevShortcutList(): readonly DevShortcut[] {
  return useContext(DevShortcutContext)?.shortcuts ?? EMPTY;
}

const EMPTY: readonly DevShortcut[] = [];

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
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/** Menus and open popovers (a select's options, a command list) own their letters for typeahead. */
export function isInsidePopupWidget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="menu"], [role="menubar"], [data-radix-popper-content-wrapper], [cmdk-root]') !== null
  );
}

/**
 * Whether a bare key press is a command rather than typing: nothing handled
 * it yet, no modifier other than Shift is held, it does not start in a text
 * field or a menu, and no dialog is open.
 */
export function isBareCommandKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !isTextEntryTarget(event.target) && !isInsidePopupWidget(event.target) && !isDialogOpen();
}
