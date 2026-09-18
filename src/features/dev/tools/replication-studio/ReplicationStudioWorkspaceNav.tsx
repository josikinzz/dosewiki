"use client";

import type { RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";

export type StudioWorkspace = "featured" | "playlists" | "substances" | null;

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
    <header className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="theme-accent-emphasis font-display text-xl font-semibold">
            Replication Studio
          </h2>
          <span className="theme-text-faint text-xs uppercase tracking-[0.24em]">dev tool</span>
        </div>
        <p className="theme-text-faint font-mono text-xs">
          {rowCount} rows · {artistCount} artists · {effectCount} effects
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-[color:var(--editor-panel-border)] py-2">
        <nav aria-label="Replication Studio workspace" className="flex flex-wrap items-center gap-1">
          <Button type="button" variant={activePanel === null ? "accent" : "ghost"} size="sm" aria-current={activePanel === null ? "page" : undefined} onClick={() => onRequestWorkspace(null)}>
            <Icon icon="lucide:library" size={15} />
            Library
          </Button>
          <Button type="button" variant={activePanel === "playlists" ? "accent" : "ghost"} size="sm" aria-current={activePanel === "playlists" ? "page" : undefined} onClick={() => onRequestWorkspace("playlists")}>
            <Icon icon="lucide:list-music" size={15} />
            Playlists
          </Button>
          <Button type="button" variant={activePanel === "substances" ? "accent" : "ghost"} size="sm" aria-current={activePanel === "substances" ? "page" : undefined} onClick={() => onRequestWorkspace("substances")}>
            <Icon icon="lucide:images" size={15} />
            Drug galleries
          </Button>
        </nav>
        <div className="h-5 w-px bg-[var(--editor-panel-border)]" aria-hidden="true" />
        <Button type="button" variant={activePanel === "featured" ? "secondary" : "quiet"} size="sm" aria-current={activePanel === "featured" ? "page" : undefined} onClick={() => onRequestWorkspace("featured")}>
          <Icon icon="lucide:star" size={15} />
          Featured
        </Button>
        <div className="flex-1" />
        {activePanel === null ? (
          <>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReload}>
              <Icon icon="lucide:refresh-cw" size={15} />
              Reload
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={onUpload}>
              <Icon icon="lucide:upload" size={15} />
              Upload
            </Button>
          </>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/mpeg,.mp3"
        className="sr-only"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </header>
  );
}
