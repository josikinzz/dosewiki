import { Fragment } from "react";
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

export const SHELL_SHORTCUTS: readonly DevShortcut[] = [
  { keys: "Cmd+K or Ctrl+K", label: "Open any tool or record" },
  { keys: "?", label: "Show these keys" },
  { keys: "Esc", label: "Close a dialog, menu or sheet" },
];

function Keys({ keys }: { keys: string }) {
  const alternatives = keys.split(/\s+or\s+/);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {alternatives.map((alternative, index) => (
        <Fragment key={`${alternative}:${index}`}>
          {index > 0 ? <span className="theme-text-faint text-xs">or</span> : null}
          {alternative.split(/\s+\/\s+/).map((key, keyIndex) => (
            <Fragment key={`${key}:${keyIndex}`}>
              {keyIndex > 0 ? <span className="theme-text-faint text-xs">/</span> : null}
              <kbd className="theme-dev-kbd">{key}</kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

function ShortcutList({ shortcuts }: { shortcuts: readonly DevShortcut[] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 text-sm">
      {shortcuts.map((shortcut) => (
        <div key={`${shortcut.keys}:${shortcut.label}`} className="contents">
          <dt>
            <span className="sr-only">{shortcut.keys}</span>
            <span aria-hidden><Keys keys={shortcut.keys} /></span>
          </dt>
          <dd className="theme-text-secondary">{shortcut.label}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DevShortcutSheet({
  open,
  onOpenChange,
  toolLabel,
  shortcuts,
  paletteKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  shortcuts: readonly DevShortcut[];
  paletteKey?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showClose={false}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single keys work anywhere in the tool except inside a text field.
            {paletteKey ? ` ${paletteKey} finds any tool or record from anywhere.` : null}
          </DialogDescription>
        </DialogHeader>
        <section aria-label={toolLabel} className="space-y-2.5">
          <h3 className="type-meta-label theme-text-faint">{toolLabel}</h3>
          {shortcuts.length > 0 ? (
            <ShortcutList shortcuts={shortcuts} />
          ) : (
            <p className="theme-text-muted text-sm">{toolLabel} has no keys of its own.</p>
          )}
        </section>
        <section aria-label="Everywhere in the editor" className="space-y-2.5">
          <h3 className="type-meta-label theme-text-faint">Everywhere in the editor</h3>
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
