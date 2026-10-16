import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { ToolGlyph, ToolLabel, ToolMarks } from "./DevModeToolRail";
import type { DevModeTab } from "./devTabRegistry";
import type { DevUtility } from "./devUtilities";

export type PaletteToolState = {
  icon: string;
  group: string;
  badge?: number;
  stale?: boolean;
  atLeast?: boolean;
  unsaved?: boolean;
};

type DevCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: AppRole | null;
  glossaryLocales?: readonly string[];
  currentTab?: DevModeTab;
  toolState?: Partial<Record<DevModeTab, PaletteToolState>>;
  utilities?: readonly DevUtility[];
  onOpenTool: (tool: PaletteTool) => void;
  onOpenRecord: (record: PaletteRecord) => void;
  onOpenHref?: (href: string) => void;
  onShowShortcuts?: () => void;
  onLeave?: () => void;
  onSignOut?: () => void;
};

type RecordsState = { records: PaletteRecord[]; loading: boolean; failed: string[]; loadedKey: string | null };

export function usePaletteKeyLabel(): string {
  return useModifierKeyLabel("K");
}

export function useModifierKeyLabel(key: string): string {
  const [label, setLabel] = useState(`Ctrl ${key}`);
  useEffect(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
      ?? navigator.platform
      ?? navigator.userAgent;
    setLabel(/mac|iphone|ipad|ipod/i.test(platform) ? `⌘${key}` : `Ctrl ${key}`);
  }, [key]);
  return label;
}

const RECENTS_KEY = "dosewiki-dev-palette-recents";
const RECENTS_LIMIT = 5;

type RecentEntry = { kind: "tool"; tab: DevModeTab } | { kind: "record"; record: Omit<PaletteRecord, "terms"> };

function readRecents(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentEntry[]).slice(0, RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

function recentKey(entry: RecentEntry): string {
  return entry.kind === "tool" ? `tool:${entry.tab}` : `record:${entry.record.key}`;
}

function rememberRecent(entry: RecentEntry) {
  try {
    const next = [entry, ...readRecents().filter((existing) => recentKey(existing) !== recentKey(entry))].slice(0, RECENTS_LIMIT);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
  }
}

export function DevCommandPalette({
  open,
  onOpenChange,
  role,
  glossaryLocales,
  currentTab,
  toolState = {},
  utilities = [],
  onOpenTool,
  onOpenRecord,
  onOpenHref,
  onShowShortcuts,
  onLeave,
  onSignOut,
}: DevCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const tools = useMemo(() => paletteToolsFor(role), [role]);
  const [state, setState] = useState<RecordsState>({ records: [], loading: false, failed: [], loadedKey: null });
  const [attempt, setAttempt] = useState(0);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const localesKey = (glossaryLocales ?? []).join(",");
  const sourceKey = `${role ?? ""}|${localesKey}|${attempt}`;

  useEffect(() => {
    if (!open || state.loadedKey === sourceKey) return;
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
        setState({ records, loading: false, failed, loadedKey: sourceKey });
      })
      .catch(() => {
        if (!cancelled) setState({ records: [], loading: false, failed: ["records"], loadedKey: sourceKey });
      });
    return () => {
      cancelled = true;
    };
  }, [localesKey, open, role, sourceKey, state.loadedKey, tools]);

  const match = useMemo(() => matchPalette(query, tools, state.records), [query, state.records, tools]);
  const labelOf = useMemo(() => new Map(tools.map((tool) => [tool.tab, tool.label])), [tools]);
  const toolByTab = useMemo(() => new Map(tools.map((tool) => [tool.tab, tool])), [tools]);

  useEffect(() => {
    if (!open) setQuery("");
    else setRecents(readRecents());
  }, [open]);

  const openTool = useCallback((tool: PaletteTool) => {
    rememberRecent({ kind: "tool", tab: tool.tab });
    onOpenTool(tool);
  }, [onOpenTool]);
  const openRecord = useCallback((record: PaletteRecord) => {
    const { terms: _terms, ...kept } = record;
    rememberRecent({ kind: "record", record: kept });
    onOpenRecord(record);
  }, [onOpenRecord]);

  const trimmed = query.trim().toLowerCase();
  type RecentRow = { key: string; tool: PaletteTool | null; record: PaletteRecord | null };
  const recentRows: RecentRow[] = trimmed === ""
    ? recents.flatMap((entry): RecentRow[] => {
        if (entry.kind === "tool") {
          const tool = toolByTab.get(entry.tab);
          return tool ? [{ key: recentKey(entry), tool, record: null }] : [];
        }
        return toolByTab.has(entry.record.tab) ? [{ key: recentKey(entry), tool: null, record: { ...entry.record, terms: "" } }] : [];
      })
    : [];

  const commands = [
    onShowShortcuts ? { key: "shortcuts", label: "Keyboard shortcuts", icon: "lucide:keyboard", terms: "keyboard shortcuts keys help", run: onShowShortcuts } : null,
    ...utilities.map((utility) => ({
      key: utility.href,
      label: utility.label,
      icon: utility.icon,
      terms: `${utility.label} ${utility.detail} utility`.toLowerCase(),
      run: () => onOpenHref?.(utility.href),
    })),
    onLeave ? { key: "leave", label: "Leave editor", icon: "lucide:door-open", terms: "leave exit close editor", run: onLeave } : null,
    onSignOut ? { key: "sign-out", label: "Sign out", icon: "lucide:log-out", terms: "sign out log out logout", run: onSignOut } : null,
  ].filter((command): command is NonNullable<typeof command> => command !== null)
    .filter((command) => trimmed === "" || trimmed.split(/\s+/).every((word) => command.terms.includes(word) || command.label.toLowerCase().includes(word)));

  const toolRow = (tool: PaletteTool, value: string) => {
    const meta = toolState[tool.tab];
    const current = tool.tab === currentTab;
    return (
      <CommandItem key={value} value={value} onSelect={() => openTool(tool)}>
        <ToolGlyph icon={meta?.icon ?? "lucide:square"} />
        <ToolLabel label={tool.label} unsaved={meta?.unsaved} badge={meta?.badge} stale={meta?.stale} atLeast={meta?.atLeast} className="truncate" />
        <ToolMarks unsaved={meta?.unsaved} badge={meta?.badge} stale={meta?.stale} atLeast={meta?.atLeast} />
        <span className="theme-text-faint ml-auto shrink-0 text-xs">
          {current ? "Current" : tool.href ? "Opens full screen" : meta?.group}
        </span>
      </CommandItem>
    );
  };

  const recordRow = (record: PaletteRecord, value: string) => (
    <CommandItem key={value} value={value} onSelect={() => openRecord(record)}>
      <ToolGlyph icon={toolState[record.tab]?.icon ?? "lucide:file-text"} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{record.title}</span>
        {record.detail ? <span className="theme-text-faint truncate text-xs">{record.detail}</span> : null}
      </span>
      <span className="theme-text-muted ml-auto shrink-0 text-xs">{labelOf.get(record.tab)}</span>
    </CommandItem>
  );

  const nothing = match.tools.length === 0 && match.views.length === 0 && match.records.length === 0 && commands.length === 0 && recentRows.length === 0;

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
            placeholder="Find a tool or record, like banners mdma"
          />
          <CommandList className="max-h-[min(60dvh,26rem)]">
            {nothing ? (
              <CommandEmpty>
                {state.loading ? "No tool matches that. Records are still loading." : "Nothing you can open matches that."}
              </CommandEmpty>
            ) : null}
            {recentRows.length > 0 ? (
              <CommandGroup heading="Recent">
                {recentRows.map((row) => row.tool ? toolRow(row.tool, `recent:${row.key}`) : row.record ? recordRow(row.record, `recent:${row.key}`) : null)}
              </CommandGroup>
            ) : null}
            {match.tools.length > 0 ? (
              <CommandGroup heading="Tools">
                {match.tools.map((tool) => toolRow(tool, `tool:${tool.tab}`))}
              </CommandGroup>
            ) : null}
            {match.views.length > 0 ? (
              <CommandGroup heading="Saved views">
                {match.views.map((view) => recordRow(view, `view:${view.key}`))}
              </CommandGroup>
            ) : null}
            {match.records.length > 0 ? (
              <CommandGroup heading="Records">
                {match.records.map((record) => recordRow(record, `record:${record.key}`))}
              </CommandGroup>
            ) : null}
            {commands.length > 0 ? (
              <CommandGroup heading="Commands">
                {commands.map((command) => (
                  <CommandItem key={command.key} value={`command:${command.key}`} onSelect={command.run}>
                    <ToolGlyph icon={command.icon} />
                    <span>{command.label}</span>
                    {command.key === "shortcuts" ? <kbd aria-hidden className="theme-dev-kbd ml-auto">?</kbd> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="theme-divider-border flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs">
            {state.loading || state.failed.length > 0 ? (
              <p role="status" className="theme-text-faint flex flex-wrap items-center gap-2">
                {state.loading
                  ? "Loading records."
                  : `Could not load records from ${state.failed.join(", ")}. Tools still open.`}
                {!state.loading && state.failed.length > 0 ? (
                  <Button type="button" variant="link" size="auto" className="text-xs" onClick={() => setAttempt((value) => value + 1)}>
                    Retry
                  </Button>
                ) : null}
              </p>
            ) : null}
            <p aria-hidden className="theme-text-faint ml-auto hidden items-center gap-3 sm:flex">
              <span className="inline-flex items-center gap-1"><kbd className="theme-dev-kbd">↑</kbd><kbd className="theme-dev-kbd">↓</kbd> move</span>
              <span className="inline-flex items-center gap-1"><kbd className="theme-dev-kbd">Enter</kbd> open</span>
              <span className="inline-flex items-center gap-1"><kbd className="theme-dev-kbd">Esc</kbd> close</span>
            </p>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

