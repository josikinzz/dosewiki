"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorField,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorSelect,
} from "@/features/dev/components";

import { EffectTagInput } from "./EffectTagInput";
import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioEffectOption, StudioMediaType } from "./replicationStudioModel";

export type IncomingFile = {
  id: string;
  file: File;
  name: string;
  type: StudioMediaType;
  /** Object URL for the local preview; audio gets the waveform placeholder instead. */
  previewUrl: string | null;
  title: string;
  artist: string;
  effectSlug: string;
  effectTags: string[];
  status: "draft" | "uploading" | "error";
  error?: string;
};

export type IncomingTrayProps = {
  items: readonly IncomingFile[];
  effects: readonly StudioEffectOption[];
  artists: readonly string[];
  onPatch: (id: string, patch: Partial<IncomingFile>) => void;
  onDiscard: (id: string) => void;
  onClear: () => void;
  onAdd: (item: IncomingFile) => void;
};

/**
 * Files wait here between the drop and the row.
 *
 * Nothing uploads on drop: an asset with no title, artist, or effect is a row
 * somebody has to find again later, so the tray asks for those first and only
 * then does the upload-then-insert round trip.
 */
export function IncomingTray({
  items,
  effects,
  artists,
  onPatch,
  onDiscard,
  onClear,
  onAdd,
}: IncomingTrayProps) {
  if (items.length === 0) {
    return null;
  }

  const effectOptions = [
    { value: "", label: "Effect…" },
    ...effects.map((effect) => ({ value: effect.slug, label: effect.name })),
  ];

  return (
    <EditorPanel>
      <EditorPanelHeader
        eyebrow="Upload"
        title="Incoming"
        meta={<Badge variant="secondary">{items.length}</Badge>}
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear tray
          </Button>
        }
      />
      <EditorPanelBody className="space-y-3">
        {items.map((item) => {
          const busy = item.status === "uploading";
          return (
            <div
              key={item.id}
              className="grid gap-3 rounded-xl border border-[color:var(--editor-panel-border)] theme-replication-muted-panel p-3 sm:grid-cols-[8rem_1fr_auto]"
            >
              <ReplicationThumb
                row={{
                  slug: item.name,
                  title: item.name,
                  type: item.type,
                  thumbnail_url: item.type === "image" ? item.previewUrl : null,
                }}
                className="aspect-[4/3]"
              />

              <div className="min-w-0 space-y-3">
                <div className="theme-text-faint truncate font-mono text-xs">
                  {item.name} · {item.type}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="Title" htmlFor={`${item.id}-title`}>
                    <Input
                      id={`${item.id}-title`}
                      inputSize="sm"
                      value={item.title}
                      disabled={busy}
                      onChange={(event) => onPatch(item.id, { title: event.target.value })}
                    />
                  </EditorField>
                  <EditorField label="Artist" htmlFor={`${item.id}-artist`}>
                    <Input
                      id={`${item.id}-artist`}
                      inputSize="sm"
                      list="studio-incoming-artists"
                      value={item.artist}
                      disabled={busy}
                      onChange={(event) => onPatch(item.id, { artist: event.target.value })}
                    />
                  </EditorField>
                </div>

                <EditorField label="Primary effect" htmlFor={`${item.id}-effect`}>
                  <EditorSelect
                    id={`${item.id}-effect`}
                    selectSize="sm"
                    value={item.effectSlug}
                    options={effectOptions}
                    disabled={busy}
                    onChange={(event) => onPatch(item.id, { effectSlug: event.target.value })}
                  />
                </EditorField>

                <EditorField label="Subjective effect tags">
                  <EffectTagInput
                    id={`${item.id}-tags`}
                    value={item.effectTags}
                    options={effects}
                    disabled={busy}
                    onChange={(next) => onPatch(item.id, { effectTags: next })}
                  />
                </EditorField>

                {item.error ? (
                  <p className="theme-danger-text text-sm">{item.error}</p>
                ) : null}
              </div>

              <div className="flex flex-row gap-2 sm:flex-col">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !item.title.trim() || !item.artist.trim() || !item.effectSlug}
                  onClick={() => onAdd(item)}
                >
                  {busy ? "Uploading…" : "Add to library"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onDiscard(item.id)}
                >
                  Discard
                </Button>
              </div>
            </div>
          );
        })}
        <datalist id="studio-incoming-artists">
          {artists.map((artist) => (
            <option key={artist} value={artist} />
          ))}
        </datalist>
      </EditorPanelBody>
    </EditorPanel>
  );
}
