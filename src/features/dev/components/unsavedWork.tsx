import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * One tool's unsaved work, as the shell sees it. `id` is the rail tab that
 * holds the work, so the rail can mark it. `save` is optional: work with no
 * one-step save (a draft that still needs its own review step) offers only
 * Discard.
 *
 * The dialog never publishes live. Publishing needs the tool's own explicit
 * action and confirm, so an entry whose save would go live sets
 * `publishesLive` and the dialog drops its Save, whatever `save` is.
 */
export interface UnsavedWorkEntry {
  id: string;
  label: string;
  dirty: boolean;
  save?: () => Promise<void>;
  discard: () => void;
  /** The save button's verb, like "Save as unpublished" or "Submit for review". */
  saveLabel?: string;
  /** This entry's save would go live; the dialog offers only Discard and Keep editing. */
  publishesLive?: boolean;
  /**
   * Work that lives above the tool switch (the shared draft) survives a rail
   * click, so only Leave, sign-out and a browser unload stop for it.
   */
  keepsOnTabSwitch?: boolean;
}

/** What is about to drop the work: a rail switch, or leaving the editor entirely. */
export type UnsavedWorkExit = "tab" | "leave";

export interface UnsavedWorkRegistry {
  /** Every registered entry that is dirty right now, in registration order. */
  dirtyEntries: readonly UnsavedWorkEntry[];
  isDirty: (id: string) => boolean;
  /**
   * Runs `proceed` at once when nothing would be lost. Otherwise opens the one
   * dialog, and runs `proceed` only after every listed entry is saved or
   * discarded. Cancel runs nothing.
   */
  confirmExit: (proceed: () => void, exit?: UnsavedWorkExit) => void;
}

type RegistryContext = UnsavedWorkRegistry & {
  register: (entry: UnsavedWorkEntry) => () => void;
};

const UnsavedWorkContext = createContext<RegistryContext | null>(null);

/** Outside the shell (a tool rendered alone, a test) nothing is tracked and nothing blocks. */
const INERT_REGISTRY: UnsavedWorkRegistry = {
  dirtyEntries: [],
  isDirty: () => false,
  confirmExit: (proceed) => proceed(),
};

type PendingExit = { ids: readonly string[]; proceed: () => void };

function exitBlockers(entries: Iterable<UnsavedWorkEntry>, exit: UnsavedWorkExit): UnsavedWorkEntry[] {
  return [...entries].filter((entry) => entry.dirty && (exit === "leave" || !entry.keepsOnTabSwitch));
}

/**
 * Holds every tool's unsaved work for the /dev shell and owns the one dialog
 * that stands between that work and a rail click, Leave, sign-out or a
 * browser unload.
 */
export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef(new Map<string, UnsavedWorkEntry>());
  const [snapshot, setSnapshot] = useState<readonly UnsavedWorkEntry[]>([]);
  const publish = useCallback(() => setSnapshot([...entriesRef.current.values()]), []);

  const register = useCallback((entry: UnsavedWorkEntry) => {
    entriesRef.current.set(entry.id, entry);
    publish();
    return () => {
      if (entriesRef.current.get(entry.id) === entry) {
        entriesRef.current.delete(entry.id);
        publish();
      }
    };
  }, [publish]);

  const dirtyEntries = useMemo(() => snapshot.filter((entry) => entry.dirty), [snapshot]);
  const anyDirty = dirtyEntries.length > 0;

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const [pending, setPending] = useState<PendingExit | null>(null);
  // Entries saved or discarded inside the open dialog. A ref, because a tool's
  // own `dirty` flag may lag one render behind its save resolving.
  const resolvedRef = useRef(new Set<string>());
  const [, setResolvedCount] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmExit = useCallback((proceed: () => void, exit: UnsavedWorkExit = "tab") => {
    const blockers = exitBlockers(entriesRef.current.values(), exit);
    if (blockers.length === 0) {
      proceed();
      return;
    }
    resolvedRef.current = new Set();
    setError(null);
    setPending({ ids: blockers.map((entry) => entry.id), proceed });
  }, []);

  // Entries read live from the map, so the dialog always calls the tool's
  // latest save and discard. Work that unregistered meanwhile is gone already.
  const openIdsOf = (exit: PendingExit | null) =>
    exit?.ids.filter((id) => !resolvedRef.current.has(id) && entriesRef.current.get(id)?.dirty) ?? [];

  const settle = (exit: PendingExit, id: string) => {
    resolvedRef.current.add(id);
    setResolvedCount(resolvedRef.current.size);
    if (openIdsOf(exit).length === 0) {
      setPending(null);
      exit.proceed();
    }
  };

  const discardOne = (exit: PendingExit, id: string) => {
    entriesRef.current.get(id)?.discard();
    setError(null);
    settle(exit, id);
  };

  const saveOne = async (exit: PendingExit, id: string) => {
    const entry = entriesRef.current.get(id);
    if (!entry?.save || entry.publishesLive) return;
    const save = entry.save;
    setSavingId(id);
    setError(null);
    try {
      await save();
      settle(exit, id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The save did not go through. Nothing was lost; try again.");
    } finally {
      setSavingId(null);
    }
  };

  const discardAll = (exit: PendingExit) => {
    for (const id of openIdsOf(exit)) entriesRef.current.get(id)?.discard();
    setPending(null);
    exit.proceed();
  };

  const close = useCallback(() => {
    if (savingId === null) setPending(null);
  }, [savingId]);

  const isDirty = useCallback((id: string) => dirtyEntries.some((entry) => entry.id === id), [dirtyEntries]);
  const value = useMemo<RegistryContext>(
    () => ({ dirtyEntries, isDirty, confirmExit, register }),
    [dirtyEntries, isDirty, confirmExit, register],
  );

  const busy = savingId !== null;
  const rows = openIdsOf(pending).map((id) => entriesRef.current.get(id)).filter((entry): entry is UnsavedWorkEntry => !!entry);
  const request = pending && rows.length > 0
    ? {
        title: rows.length === 1 ? "Save or discard your changes?" : `Save or discard ${rows.length} unsaved changes?`,
        description: "These changes are not saved yet. Save them, discard them, or keep editing.",
        cancelLabel: "Keep editing",
        destructive: true,
        confirmLabel: rows.length > 1 ? "Discard all and continue" : undefined,
        onConfirm: () => discardAll(pending),
        body: (
          <div className="space-y-2">
            <ul className="space-y-1.5">
              {rows.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="theme-text-secondary block truncate text-sm">{entry.label}</span>
                    {entry.publishesLive ? (
                      <span className="theme-text-muted block text-xs">
                        This change would go live. Publish it from the tool; leaving here never publishes.
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => discardOne(pending, entry.id)}>
                      Discard
                    </Button>
                    {entry.save && !entry.publishesLive ? (
                      <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        disabled={busy}
                        aria-busy={savingId === entry.id || undefined}
                        onClick={() => void saveOne(pending, entry.id)}
                      >
                        {savingId === entry.id ? "Saving…" : entry.saveLabel ?? "Save"}
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {error ? <p role="alert" className="text-dose-text-primary text-sm">{error}</p> : null}
          </div>
        ),
      }
    : null;

  return (
    <UnsavedWorkContext.Provider value={value}>
      {children}
      <ConfirmDialog request={request} onClose={close} />
    </UnsavedWorkContext.Provider>
  );
}

/** The shell's view of every tool's unsaved work. Inert outside the provider. */
export function useUnsavedWorkRegistry(): UnsavedWorkRegistry {
  return useContext(UnsavedWorkContext) ?? INERT_REGISTRY;
}

/**
 * Reports a tool's unsaved work to the shell for as long as the tool is
 * mounted. `save` and `discard` are read at call time, so callers need not
 * memoise them.
 */
export function useUnsavedWork(entry: UnsavedWorkEntry): void {
  const registry = useContext(UnsavedWorkContext);
  const latest = useRef(entry);
  useEffect(() => {
    latest.current = entry;
  });
  const { id, label, dirty, saveLabel, keepsOnTabSwitch, publishesLive } = entry;
  const canSave = entry.save !== undefined && !publishesLive;
  const register = registry?.register;

  useEffect(() => {
    if (!register) return;
    return register({
      id,
      label,
      dirty,
      saveLabel,
      keepsOnTabSwitch,
      publishesLive,
      save: canSave ? () => latest.current.save?.() ?? Promise.resolve() : undefined,
      discard: () => latest.current.discard(),
    });
  }, [register, id, label, dirty, saveLabel, keepsOnTabSwitch, publishesLive, canSave]);
}
