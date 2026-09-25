import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DevShortcut } from "../components/devShortcuts";

/** Keys the shell answers to in every tool. */
export const SHELL_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "Cmd+K or Ctrl+K", label: "Open any tool or record" },
  { keys: "?", label: "Show these keys" },
];

function ShortcutList({ shortcuts }: { shortcuts: readonly DevShortcut[] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {shortcuts.map((shortcut) => (
        <div key={`${shortcut.keys}:${shortcut.label}`} className="contents">
          <dt>
            <kbd className="theme-text-primary rounded border border-current/25 px-1.5 py-0.5 font-mono text-xs">
              {shortcut.keys}
            </kbd>
          </dt>
          <dd className="theme-text-secondary">{shortcut.label}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The one `?` sheet in /dev: the open tool's keys, as the tool registered
 * them through `useDevShortcuts`, then the keys the shell answers to
 * everywhere.
 */
export function DevShortcutSheet({
  open,
  onOpenChange,
  toolLabel,
  shortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  shortcuts: readonly DevShortcut[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showClose={false}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single keys work anywhere in the tool except inside a text field.
          </DialogDescription>
        </DialogHeader>
        <section aria-label={toolLabel} className="space-y-2">
          <h3 className="theme-text-faint text-xs font-semibold uppercase tracking-[0.12em]">{toolLabel}</h3>
          {shortcuts.length > 0 ? (
            <ShortcutList shortcuts={shortcuts} />
          ) : (
            <p className="theme-text-muted text-sm">{toolLabel} has no keys of its own.</p>
          )}
        </section>
        <section aria-label="Everywhere in the editor" className="space-y-2">
          <h3 className="theme-text-faint text-xs font-semibold uppercase tracking-[0.12em]">Everywhere in the editor</h3>
          <ShortcutList shortcuts={SHELL_SHORTCUTS} />
        </section>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
