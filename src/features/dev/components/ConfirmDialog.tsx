import type { ReactNode } from "react";
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
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Rows a bulk write touches; the first eight are listed, the rest counted. */
  affected?: string[];
  onConfirm: () => void | Promise<void>;
}

export interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onClose: () => void;
}

/**
 * The one confirmation pattern for one-click production writes. Rendering is
 * driven by a {@link ConfirmRequest}; closing (overlay click, Escape, Cancel,
 * or a completed confirm) clears the request through `onClose`. While an async
 * `onConfirm` is settling both buttons lock so a double tap cannot fire twice.
 */
export function ConfirmDialog({ request, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const handleConfirm = async () => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
    }
    onClose();
  };

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
        className="max-w-md"
        showClose={false}
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus({ preventScroll: true });
          }
        }}
      >
        {request ? (
          <>
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription className="theme-text-muted">{request.description}</DialogDescription>
            </DialogHeader>
            {affected.length > 0 ? (
              <div className="space-y-1.5">
                <p className="theme-text-faint text-xs font-medium uppercase tracking-wide">
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
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                {request.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                type="button"
                variant={request.destructive ? "destructive" : "accent"}
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void handleConfirm()}
              >
                {request.confirmLabel}
              </Button>
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
