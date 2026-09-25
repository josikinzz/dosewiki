import type { ReactNode, RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Rows shown in full before the list collapses into "and N more". */
const AFFECTED_PREVIEW_LIMIT = 8;

export interface ConfirmRequest {
  title: string;
  description: ReactNode;
  /** Extra content under the description, such as per-row actions. */
  body?: ReactNode;
  /** Omitted when the body carries the actions; the dialog then offers only Cancel. */
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Rows a bulk write touches; the first eight are listed, the rest counted. */
  affected?: string[];
  /** Widens the dialog for a body that carries diffs. */
  wide?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onClose: () => void;
  /**
   * Where focus lands when the dialog closes. Defaults to whatever held focus
   * when it opened; pass a ref when that control may be gone or disabled by then.
   */
  returnFocus?: RefObject<HTMLElement | null>;
}

/**
 * The one confirmation pattern for one-click production writes. Rendering is
 * driven by a {@link ConfirmRequest}; closing (overlay click, Escape, Cancel,
 * or a completed confirm) clears the request through `onClose`. While an async
 * `onConfirm` is settling both buttons lock so a double tap cannot fire twice.
 */
export function ConfirmDialog({ request, onClose, returnFocus: returnFocusTarget }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ request: ConfirmRequest; message: string } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // A refused confirm keeps the dialog open with the reason inside it, so the
  // editor can try again or cancel instead of watching nothing happen.
  const handleConfirm = async () => {
    if (!request || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await request.onConfirm();
    } catch (error) {
      setFailure({ request, message: error instanceof Error && error.message ? error.message : "That did not go through. Try again." });
      return;
    } finally {
      setBusy(false);
    }
    onClose();
  };
  const failureMessage = failure && failure.request === request ? failure.message : null;

  const affected = request?.affected ?? [];
  const preview = affected.slice(0, AFFECTED_PREVIEW_LIMIT);
  const remainder = affected.length - preview.length;

  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className={request?.wide ? "max-w-2xl" : "max-w-md"}
        showClose={false}
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTarget?.current ?? returnFocus.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
      >
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription className="theme-text-muted">{request.description}</DialogDescription>
            </DialogHeader>
            {request.body}
            {affected.length > 0 ? (
              <div className="space-y-1.5">
                <p className="type-meta-label theme-text-faint">
                  Affects {affected.length} {affected.length === 1 ? "row" : "rows"}
                </p>
                <ul className="theme-text-secondary max-h-48 space-y-0.5 overflow-y-auto text-sm">
                  {preview.map((row) => (
                    <li key={row} className="truncate">
                      {row}
                    </li>
                  ))}
                  {remainder > 0 ? <li className="theme-text-faint">and {remainder} more</li> : null}
                </ul>
              </div>
            ) : null}
            {failureMessage ? (
              <p role="alert" className="theme-danger-surface theme-danger-text rounded-control border px-3 py-2 text-sm">
                {failureMessage}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {request.cancelLabel ?? "Cancel"}
              </Button>
              {request.confirmLabel ? (
                <Button
                  type="button"
                  variant={request.destructive ? "destructive" : "accent"}
                  disabled={busy}
                  aria-busy={busy || undefined}
                  onClick={() => void handleConfirm()}
                >
                  {failureMessage ? "Try again" : request.confirmLabel}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owns the pending request so a tab can raise a confirmation from any handler
 * with `confirm({...})` and render `dialog` once near its root.
 */
export function useConfirm(): { confirm: (request: ConfirmRequest) => void; dialog: ReactNode } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const close = useCallback(() => setRequest(null), []);
  const dialog = useMemo(() => <ConfirmDialog request={request} onClose={close} />, [request, close]);
  return { confirm: setRequest, dialog };
}
