"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button, Input, Textarea } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorField } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { CopyStudioBlock, CopyStudioDraft } from "./copyStudioUtils";

/** The server keeps at most this many list items. */
const MAX_ITEMS = 64;

const DESCRIPTIONS: Record<CopyStudioBlock["kind"], string> = {
  markdown: "Markdown: links, emphasis and paragraphs render; HTML does not run.",
  plain: "Plain text: shown exactly as typed, Markdown is not rendered.",
  list: "One entry per row. Empty rows are left out when it goes live.",
};

const ICON_BUTTON = "size-8 shrink-0 px-0 [@media(pointer:coarse)]:size-11";
/** Move and Remove sit on the row from `sm` up; on a phone they fold into the row's menu so the field keeps its width. */
const ROW_ONLY = "max-sm:hidden";

/**
 * The editable body of one copy block, shared by Copy in the editor and the
 * contextual editor on public pages. Markdown and plain blocks are one
 * textarea labelled "Copy" that grows with its words; a list is one field per
 * item with Move up, Move down and Remove (with a way to undo it) and Add
 * item, and focus follows every change so a keyboard never loses its place.
 *
 * `lengthGuide` (optional) shows a running character count against a target,
 * for text a search result or a browser tab cuts short.
 */
export function CopyBlockFields({
  kind,
  draft,
  onChange,
  lengthGuide,
}: {
  kind: CopyStudioBlock["kind"];
  draft: CopyStudioDraft;
  onChange: (draft: CopyStudioDraft) => void;
  lengthGuide?: { target: number; where: string };
}) {
  const [removed, setRemoved] = useState<{ item: string; index: number; items: string[] } | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** What to focus once the list has re-rendered: a row's field or one of its buttons, or Add item. */
  const focusTarget = useRef<{ index: number; control: "field" | "up" | "down" } | "add" | null>(null);

  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    const list = listRef.current;
    if (!list) return;
    if (target === "add") {
      list.querySelector<HTMLButtonElement>("button[data-copy-add]")?.focus();
      return;
    }
    const rows = list.querySelectorAll<HTMLElement>("li[data-copy-row]");
    const row = rows[Math.min(target.index, rows.length - 1)];
    const wanted = row?.querySelector<HTMLElement>(target.control === "field" ? "input" : `button[data-move="${target.control}"]:not(:disabled)`);
    (wanted ?? row?.querySelector<HTMLElement>("input"))?.focus();
  }, [draft.items]);

  const atCap = draft.items.length >= MAX_ITEMS;
  const remove = (index: number) => {
    const item = draft.items[index];
    const items = draft.items.filter((_, position) => index !== position);
    setRemoved({ item, index, items });
    setMoved(null);
    focusTarget.current = items.length > 0 ? { index, control: "field" } : "add";
    onChange({ ...draft, items });
  };
  const move = (index: number, step: -1 | 1) => {
    const to = index + step;
    if (to < 0 || to >= draft.items.length) return;
    const items = [...draft.items];
    [items[index], items[to]] = [items[to], items[index]];
    focusTarget.current = { index: to, control: step < 0 ? "up" : "down" };
    setMoved(`Item ${index + 1} moved to position ${to + 1}.`);
    setRemoved(null);
    onChange({ ...draft, items });
  };

  const length = draft.body.length;
  const counter = kind === "list"
    ? `${draft.items.length} of ${MAX_ITEMS}`
    : lengthGuide
      ? `${length} characters; ${lengthGuide.where} show about ${lengthGuide.target}`
      : undefined;

  return <EditorField label={kind === "list" ? "Items" : "Copy"} description={DESCRIPTIONS[kind]} counter={counter} tone={lengthGuide && kind !== "list" && length > lengthGuide.target ? "warning" : "default"}>
    {(fieldProps) => kind === "list" ? <div ref={listRef} className="space-y-2">
      {draft.items.length === 0 ? <p className="theme-text-muted text-sm">No items yet. Add one to start the list.</p> : null}
      <ol className="space-y-2">
        {draft.items.map((item, index) => <li key={index} data-copy-row="" className="flex items-center gap-1.5">
          <span aria-hidden className="theme-text-faint w-5 shrink-0 text-right text-xs tabular-nums">{index + 1}</span>
          <Input
            id={index === 0 ? fieldProps.id : `${fieldProps.id}-${index}`}
            aria-describedby={fieldProps["aria-describedby"]}
            aria-label={`Item ${index + 1}`}
            className="min-w-0 flex-1 text-[16px] md:text-sm"
            maxLength={2000}
            value={item}
            onChange={(event) => onChange({ ...draft, items: draft.items.map((value, position) => position === index ? event.target.value : value) })}
          />
          <Button type="button" variant="ghost" size="sm" data-move="up" className={cn(ICON_BUTTON, ROW_ONLY)} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move item ${index + 1} up`} title="Move up">
            <Icon icon="lucide:arrow-up" size={14} />
          </Button>
          <Button type="button" variant="ghost" size="sm" data-move="down" className={cn(ICON_BUTTON, ROW_ONLY)} disabled={index === draft.items.length - 1} onClick={() => move(index, 1)} aria-label={`Move item ${index + 1} down`} title="Move down">
            <Icon icon="lucide:arrow-down" size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(ROW_ONLY, "shrink-0")}
            onClick={() => remove(index)}
            aria-label={`Remove item ${index + 1}`}
          >
            <Icon icon="lucide:x" size={14} />
            Remove
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className={cn(ICON_BUTTON, "sm:hidden")} aria-label={`More for item ${index + 1}`}>
                <Icon icon="lucide:ellipsis" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                <Icon icon="lucide:arrow-up" size={14} className="mr-2" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === draft.items.length - 1} onSelect={() => move(index, 1)}>
                <Icon icon="lucide:arrow-down" size={14} className="mr-2" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-dose-danger" onSelect={() => remove(index)}>
                <Icon icon="lucide:x" size={14} className="mr-2" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>)}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          id={draft.items.length === 0 ? fieldProps.id : undefined}
          data-copy-add=""
          type="button"
          aria-describedby={fieldProps["aria-describedby"]}
          variant="outline"
          size="sm"
          disabled={atCap}
          onClick={() => {
            focusTarget.current = { index: draft.items.length, control: "field" };
            setRemoved(null);
            setMoved(null);
            onChange({ ...draft, items: [...draft.items, ""] });
          }}
        >
          <Icon icon="lucide:plus" size={14} />
          Add item
        </Button>
        {atCap ? <span className="theme-text-muted text-xs">A list holds at most {MAX_ITEMS} items.</span> : null}
        {removed && removed.items === draft.items && <><span role="status" className="theme-text-muted text-sm">Item removed.</span><Button type="button" variant="ghost" size="sm" disabled={atCap} onClick={() => { const items = [...draft.items]; const at = Math.min(removed.index, items.length); items.splice(at, 0, removed.item); focusTarget.current = { index: at, control: "field" }; onChange({ ...draft, items }); setRemoved(null); }}>Undo removal</Button></>}
        <span role="status" className="sr-only">{moved ?? ""}</span>
      </div>
    </div> : <Textarea {...fieldProps} rows={kind === "markdown" ? 8 : 3} className={cn("text-[16px] md:text-sm [field-sizing:content]", kind === "markdown" ? "min-h-40 max-h-[70vh]" : "min-h-20 max-h-[50vh]")} maxLength={20000} value={draft.body} onChange={(event) => onChange({ ...draft, body: event.target.value })} />}
  </EditorField>;
}
