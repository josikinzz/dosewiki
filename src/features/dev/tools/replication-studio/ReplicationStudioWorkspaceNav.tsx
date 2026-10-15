"use client";

import type { RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { SaveLine } from "@/features/dev/components";
import { findDevTab } from "@/features/dev/pages/devTabRegistry";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

export type StudioWorkspace = "featured" | "playlists" | "substances" | null;

const WORKSPACES: { value: StudioWorkspace; label: string; icon: string }[] = [
  { value: null, label: "Library", icon: "lucide:library" },
  { value: "playlists", label: "Playlists", icon: "lucide:list-music" },
  { value: "substances", label: "Showcases", icon: "lucide:images" },
  { value: "featured", label: "Featured", icon: "lucide:star" },
];

export function ReplicationStudioWorkspaceNav({
  activePanel,
  rowCount,
  artistCount,
  effectCount,
  busy,
  fileInputRef,
  onRequestWorkspace,
  onReload,
  onUpload,
  onFiles,
}: {
  activePanel: StudioWorkspace;
  rowCount: number;
  artistCount: number;
  effectCount: number;
  busy: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onRequestWorkspace: (workspace: StudioWorkspace) => void;
  onReload: () => void;
  onUpload: () => void;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 max-sm:order-1">
        <h2 className="theme-text-primary font-display text-lg font-semibold leading-tight">
          Replication Studio
        </h2>
        <p className="theme-text-faint text-xs tabular-nums">
          {rowCount} works · {artistCount} artists · {effectCount} effects
        </p>
      </div>

      <nav
        aria-label="Replication Studio workspace"
        className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border max-sm:order-2 max-sm:w-full border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
      >
        {WORKSPACES.map((workspace) => {
          const active = activePanel === workspace.value;
          return (
            <Button
              key={workspace.label}
              type="button"
              size="sm"
              variant={active ? "pillActive" : "quiet"}
              aria-current={active ? "page" : undefined}
              className={cn("shrink-0 rounded-full max-sm:flex-1 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:min-h-0", TOUCH_HALO_Y, !active && "theme-text-muted")}
              onClick={() => onRequestWorkspace(workspace.value)}
            >
              <Icon icon={workspace.icon} size={15} className="max-sm:hidden" />
              <span>{workspace.label}</span>
            </Button>
          );
        })}
      </nav>

      <div className="contents sm:ml-auto sm:flex sm:items-center sm:gap-2">
        <SaveLine model={findDevTab("replications").saveModel} className="whitespace-nowrap max-sm:order-4" />
        <div className="flex items-center gap-2 max-sm:order-3 max-sm:ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onReload}
            aria-label="Refresh the corpus"
            title="Refresh the corpus"
          >
            <Icon icon="lucide:refresh-cw" size={15} />
            <span className="max-lg:sr-only">Refresh</span>
          </Button>
          <Button type="button" variant="accent" size="sm" onClick={onUpload}>
            <Icon icon="lucide:upload" size={15} />
            Upload
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/mpeg,.mp3"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </header>
  );
}
