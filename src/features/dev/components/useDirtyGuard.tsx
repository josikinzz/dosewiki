import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DirtyGuardCopy {
  title?: string;
  description?: string;
  onSave?: () => Promise<void>;
  onDiscard?: () => void;
  canDiscard?: boolean;
  container?: HTMLElement | null;
  warnOnUnload?: boolean;
}

const DEFAULT_TITLE = "Discard unsaved changes?";
const DEFAULT_DESCRIPTION =
  "This draft has changes that are not saved. Continue only if you want to discard them.";

export function useDirtyGuard(
  isDirty: boolean,
  copy?: DirtyGuardCopy,
): { guard: (proceed: () => void) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  const warnOnUnload = copy?.warnOnUnload !== false;
  useEffect(() => {
    if (!isDirty || !warnOnUnload) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, warnOnUnload]);

  const guard = useCallback((proceed: () => void) => {
    if (dirtyRef.current) {
      setError(null);
      setPending(() => proceed);
    } else {
      proceed();
    }
  }, []);

  const discard = () => {
    copy?.onDiscard?.();
    const proceed = pending;
    setPending(null);
    proceed?.();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await copy?.onSave?.();
      const proceed = pending;
      setPending(null);
      proceed?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save the draft. Keep editing and try again.");
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) setPending(null);
      }}
    >
      <DialogContent container={copy?.container ?? undefined} className="max-w-md" showClose={false}>
        <DialogHeader>
          <DialogTitle>{copy?.title ?? DEFAULT_TITLE}</DialogTitle>
          <DialogDescription className="theme-text-muted">
            {copy?.description ?? DEFAULT_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-dose-text-primary">{error}</p> : null}
        <DialogFooter className="flex-wrap gap-2 [&>button]:h-auto [&>button]:min-h-10 [&>button]:whitespace-normal">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setPending(null)}>
            Keep editing
          </Button>
          {copy?.canDiscard !== false ? <Button type="button" variant="destructive" disabled={busy} onClick={discard}>
            Discard changes
          </Button> : null}
          {copy?.onSave ? <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving draft" : "Save draft and continue"}
          </Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { guard, dialog };
}
