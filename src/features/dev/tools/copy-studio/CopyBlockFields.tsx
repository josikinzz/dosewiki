"use client";
import { useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { EditorField } from "@/features/dev/components";
import type { CopyStudioBlock, CopyStudioDraft } from "./copyStudioUtils";

export function CopyBlockFields({ kind, draft, onChange }: { kind: CopyStudioBlock["kind"]; draft: CopyStudioDraft; onChange: (draft: CopyStudioDraft) => void }) {
  const [removed, setRemoved] = useState<{ item: string; index: number; items: string[] } | null>(null);
  return <EditorField label={kind === "list" ? "Items" : "Copy"} description={kind === "markdown" ? "Markdown supports links, emphasis, and paragraphs. HTML is not executed." : kind === "list" ? "One entry per row; empty entries are omitted on publication." : "Plain text; Markdown is not rendered."}>
    {(fieldProps) => kind === "list" ? <div className="space-y-2">
      {draft.items.map((item, index) => <div key={index} className="flex gap-2">
        <Input id={index === 0 ? fieldProps.id : `${fieldProps.id}-${index}`} aria-describedby={fieldProps["aria-describedby"]} aria-label={`Item ${index + 1}`} className="min-w-0 flex-1" maxLength={2000} value={item} onChange={(event) => onChange({ ...draft, items: draft.items.map((value, position) => position === index ? event.target.value : value) })} />
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { const items = draft.items.filter((_, position) => index !== position); setRemoved({ item, index, items }); onChange({ ...draft, items }); }} aria-label={`Remove item ${index + 1}`}>Remove</Button>
      </div>)}
      <div className="flex flex-wrap items-center gap-2">
        <Button id={draft.items.length === 0 ? fieldProps.id : undefined} aria-describedby={fieldProps["aria-describedby"]} variant="secondary" size="sm" disabled={draft.items.length >= 64} onClick={() => onChange({ ...draft, items: [...draft.items, ""] })}>Add item</Button>
        {removed && removed.items === draft.items && <><span role="status" className="theme-text-muted text-sm">Item removed.</span><Button variant="ghost" size="sm" disabled={draft.items.length >= 64} onClick={() => { const items = [...draft.items]; items.splice(Math.min(removed.index, items.length), 0, removed.item); onChange({ ...draft, items }); setRemoved(null); }}>Undo removal</Button></>}
      </div>
    </div> : <Textarea {...fieldProps} rows={kind === "markdown" ? 6 : 4} className={kind === "markdown" ? "md:min-h-80" : undefined} maxLength={20000} value={draft.body} onChange={(event) => onChange({ ...draft, body: event.target.value })} />}
  </EditorField>;
}
