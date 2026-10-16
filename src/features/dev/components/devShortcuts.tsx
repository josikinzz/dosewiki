import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

export interface DevShortcut {
  keys: string;
  label: string;
}

interface ShortcutRegistryContext {
  shortcuts: readonly DevShortcut[];
  register: (id: string, shortcuts: readonly DevShortcut[]) => () => void;
}

const DevShortcutContext = createContext<ShortcutRegistryContext | null>(null);

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

export function useDevShortcutList(): readonly DevShortcut[] {
  return useContext(DevShortcutContext)?.shortcuts ?? EMPTY;
}

const EMPTY: readonly DevShortcut[] = [];

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
}

export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

export function isInsidePopupWidget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="menu"], [role="menubar"], [data-radix-popper-content-wrapper], [cmdk-root]') !== null
  );
}

export function isBareCommandKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !isTextEntryTarget(event.target) && !isInsidePopupWidget(event.target) && !isDialogOpen();
}
