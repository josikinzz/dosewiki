import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";

interface UnsavedWorkMetadata {
  id: string;
  save?: never;
  publishesLive?: never;
  tab?: string;
  label: string;
  dirty: boolean;
  discard: () => void;
  saveLabel?: string;
  keepsOnTabSwitch?: boolean;
}

export type UnsavedWorkEntry = UnsavedWorkMetadata & (
  | { kind: "discard-only"; because: string; saveDraft?: never; submit?: never }
  | { kind: "save-unpublished"; saveDraft: () => Promise<void>; submit?: never; because?: never }
  | { kind: "submit-proposal"; submit: () => Promise<void>; saveDraft?: never; because?: never }
);

export type UnsavedWorkExit = "tab" | "leave";

export interface UnsavedWorkExitScope {
  tab?: string;
}

export interface UnsavedWorkRegistry {
  dirtyEntries: readonly UnsavedWorkEntry[];
  isDirty: (tab: string) => boolean;
  confirmExit: (proceed: () => void, exit?: UnsavedWorkExit, scope?: UnsavedWorkExitScope) => void;
}

type RegistryContext = UnsavedWorkRegistry & {
  register: (entry: UnsavedWorkEntry) => () => void;
};

const UnsavedWorkContext = createContext<RegistryContext | null>(null);

const INERT_REGISTRY: UnsavedWorkRegistry = {
  dirtyEntries: [],
  isDirty: () => false,
  confirmExit: (proceed) => proceed(),
};

type PendingExit = { ids: readonly string[]; proceed: () => void };

function exitBlockers(
  entries: Iterable<UnsavedWorkEntry>,
  exit: UnsavedWorkExit,
  scope: UnsavedWorkExitScope | undefined,
): UnsavedWorkEntry[] {
  return [...entries].filter(
    (entry) =>
      entry.dirty &&
      (exit === "leave" || !entry.keepsOnTabSwitch) &&
      (scope?.tab === undefined || (entry.tab ?? entry.id) === scope.tab),
  );
}

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
  const resolvedRef = useRef(new Set<string>());
  const [, setResolvedCount] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmExit = useCallback((proceed: () => void, exit: UnsavedWorkExit = "tab", scope?: UnsavedWorkExitScope) => {
    const blockers = exitBlockers(entriesRef.current.values(), exit, scope);
    if (blockers.length === 0) {
      proceed();
      return;
    }
    resolvedRef.current = new Set();
    setError(null);
    setPending({ ids: blockers.map((entry) => entry.id), proceed });
  }, []);

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
    if (!entry || entry.kind === "discard-only") return;
    const save = entry.kind === "save-unpublished" ? entry.saveDraft : entry.submit;
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

  const isDirty = useCallback(
    (tab: string) => dirtyEntries.some((entry) => (entry.tab ?? entry.id) === tab),
    [dirtyEntries],
  );
  const value = useMemo<RegistryContext>(
    () => ({ dirtyEntries, isDirty, confirmExit, register }),
    [dirtyEntries, isDirty, confirmExit, register],
  );

  const busy = savingId !== null;
  const rows = openIdsOf(pending).map((id) => entriesRef.current.get(id)).filter((entry): entry is UnsavedWorkEntry => !!entry);
  const anySavable = rows.some((entry) => entry.kind !== "discard-only");
  const request = pending && rows.length > 0
    ? {
        title: anySavable
          ? rows.length === 1 ? "Save or discard your changes?" : `Save or discard ${rows.length} unsaved changes?`
          : rows.length === 1 ? "Discard your changes?" : `Discard ${rows.length} unsaved changes?`,
        description: anySavable
          ? "These changes are not saved yet. Save them, discard them, or keep editing."
          : "These changes cannot be saved from here. Discard them, or keep editing and finish them in the tool.",
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
                    {entry.kind === "discard-only" ? (
                      <span className="theme-text-muted block text-xs">
                        {entry.because}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => discardOne(pending, entry.id)}>
                      Discard
                    </Button>
                    {entry.kind !== "discard-only" ? (
                      <Button
                        type="button"
                        variant="accent"
                        size="sm"
                        disabled={busy}
                        aria-busy={savingId === entry.id || undefined}
                        onClick={() => void saveOne(pending, entry.id)}
                      >
                        {savingId === entry.id ? "Saving" : entry.saveLabel ?? "Save"}
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

export function useUnsavedWorkRegistry(): UnsavedWorkRegistry {
  return useContext(UnsavedWorkContext) ?? INERT_REGISTRY;
}

export function useUnsavedWork(entry: UnsavedWorkEntry): void {
  const registry = useContext(UnsavedWorkContext);
  const latest = useRef(entry);
  useEffect(() => {
    latest.current = entry;
  });
  const { id, tab, label, dirty, saveLabel, keepsOnTabSwitch, kind } = entry;
  const because = entry.kind === "discard-only" ? entry.because : undefined;
  const register = registry?.register;

  useEffect(() => {
    if (!register) return;
    const metadata = { id, tab, label, dirty, saveLabel, keepsOnTabSwitch, discard: () => latest.current.discard() };
    const unavailable = () => { throw new Error("This action is no longer available. Keep editing and finish it in the tool."); };
    switch (kind) {
      case "discard-only":
        return register({ ...metadata, kind, because: because ?? "Finish this change in the tool." });
      case "save-unpublished":
        return register({ ...metadata, kind, saveDraft: () => {
          const current = latest.current;
          return current.kind === "save-unpublished" ? current.saveDraft() : unavailable();
        } });
      case "submit-proposal":
        return register({ ...metadata, kind, submit: () => {
          const current = latest.current;
          return current.kind === "submit-proposal" ? current.submit() : unavailable();
        } });
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  }, [register, id, tab, label, dirty, saveLabel, keepsOnTabSwitch, kind, because]);
}
