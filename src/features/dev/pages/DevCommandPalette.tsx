import { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AppRole } from "@/lib/auth/roles";
import {
  matchPalette,
  paletteToolsFor,
  type PaletteRecord,
  type PaletteTool,
} from "./devCommandPaletteModel";

type DevCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: AppRole | null;
  /** The session's glossary grant, so the Glossary offers only its languages. */
  glossaryLocales?: readonly string[];
  onOpenTool: (tool: PaletteTool) => void;
  onOpenRecord: (record: PaletteRecord) => void;
};

type RecordsState = { records: PaletteRecord[]; loading: boolean; failed: string[] };

/**
 * Cmd+K: every tool the role may open, plus the records each tool offers
 * (`devRecordSources`). The record reads start when the palette first opens
 * and are cached there, so a closed palette costs nothing. What the palette
 * opens goes through the chrome's guarded navigation, the same path as a rail
 * click.
 */
export function DevCommandPalette({
  open,
  onOpenChange,
  role,
  glossaryLocales,
  onOpenTool,
  onOpenRecord,
}: DevCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const tools = useMemo(() => paletteToolsFor(role), [role]);
  const [state, setState] = useState<RecordsState>({ records: [], loading: false, failed: [] });
  const localesKey = (glossaryLocales ?? []).join(",");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    const openable = new Set(tools.map((tool) => tool.tab));
    const locales = localesKey ? localesKey.split(",") : [];
    void import("./devRecordSources")
      .then(({ devRecordSourcesFor }) => {
        const sources = devRecordSourcesFor(openable);
        return Promise.allSettled(sources.map((source) => source.load({ role, glossaryLocales: locales })))
          .then((results) => ({ sources, results }));
      })
      .then(({ sources, results }) => {
        if (cancelled) return;
        const records: PaletteRecord[] = [];
        const failed: string[] = [];
        results.forEach((result, index) => {
          if (result.status === "fulfilled") records.push(...result.value);
          else failed.push(tools.find((tool) => tool.tab === sources[index].tab)?.label ?? sources[index].tab);
        });
        setState({ records, loading: false, failed });
      })
      .catch(() => {
        if (!cancelled) setState({ records: [], loading: false, failed: ["records"] });
      });
    return () => {
      cancelled = true;
    };
  }, [localesKey, open, role, tools]);

  const match = useMemo(() => matchPalette(query, tools, state.records), [query, state.records, tools]);
  const labelOf = useMemo(() => new Map(tools.map((tool) => [tool.tab, tool.label])), [tools]);

  // Every open starts from an empty query, however the last one closed.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-xl gap-0 overflow-hidden p-0 sm:top-[20%] sm:translate-y-0">
        <DialogTitle className="sr-only">Open a tool or record</DialogTitle>
        <DialogDescription className="sr-only">
          Type a tool name, or a tool name and a record, like banners mdma. Enter opens the highlighted result.
        </DialogDescription>
        <Command
          shouldFilter={false}
          label="Open a tool or record"
          className="rounded-none border-0 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:min-h-11"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Open a tool or record, like banners mdma"
          />
          <CommandList className="max-h-[min(60dvh,26rem)]">
            <CommandEmpty>
              {state.loading ? "Loading records." : "Nothing you can open matches that."}
            </CommandEmpty>
            {match.tools.length > 0 ? (
              <CommandGroup heading="Tools">
                {match.tools.map((tool) => (
                  <CommandItem key={tool.tab} value={`tool:${tool.tab}`} onSelect={() => onOpenTool(tool)}>
                    <span>{tool.label}</span>
                    {tool.href ? <span className="theme-text-faint ml-auto text-xs">Opens full screen</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {match.records.length > 0 ? (
              <CommandGroup heading="Records">
                {match.records.map((record) => (
                  <CommandItem key={record.key} value={`record:${record.key}`} onSelect={() => onOpenRecord(record)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{record.title}</span>
                      {record.detail ? <span className="theme-text-faint truncate text-xs">{record.detail}</span> : null}
                    </span>
                    <span className="theme-text-muted ml-auto shrink-0 text-xs">{labelOf.get(record.tab)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          {state.loading || state.failed.length > 0 ? (
            <p role="status" className="theme-divider theme-text-faint border-t px-3 py-2 text-xs">
              {state.loading
                ? "Loading records."
                : `Could not load records from ${state.failed.join(", ")}. Tools still open.`}
            </p>
          ) : null}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
