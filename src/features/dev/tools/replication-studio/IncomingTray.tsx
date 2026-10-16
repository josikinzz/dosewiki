"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorField,
  Notice,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorSelect,
} from "@/features/dev/components";
import { isReplicationSourceUrl, replicationProvenanceGaps } from "@/types/replications";

import { ReplicationThumb } from "./ReplicationThumb";
import {
  LOW_RESOLUTION_MIN_EDGE,
  RIGHTS_STATUS_LABELS,
  STUDIO_SETTABLE_RIGHTS,
  isLowResolution,
  type StudioEffectOption,
  type StudioMediaType,
  type StudioRightsStatus,
  type StudioRow,
} from "./replicationStudioModel";

export type IncomingFile = {
  id: string;
  file: File;
  name: string;
  type: StudioMediaType;
  previewUrl: string | null;
  title: string;
  artist: string;
  effectSlug: string;
  rightsStatus: StudioRightsStatus;
  sourceUrl: string;
  creditLine: string;
  sha256?: string | null;
  size?: { width: number; height: number };
  status: "draft" | "uploading" | "error";
  error?: string;
};

export type IncomingTrayProps = {
  items: readonly IncomingFile[];
  duplicates: ReadonlyMap<string, readonly string[]>;
  waiting: readonly StudioRow[];
  effects: readonly StudioEffectOption[];
  artists: readonly string[];
  busy?: boolean;
  onPatch: (id: string, patch: Partial<IncomingFile>) => void;
  onDiscard: (id: string) => void;
  onClear: () => void;
  onAdd: (item: IncomingFile) => void;
  onAddAll: () => void;
  onPublish: (rows: readonly StudioRow[]) => void;
  onDismissWaiting: () => void;
};

function sourceError(value: string): string | undefined {
  return value.trim() && !isReplicationSourceUrl(value)
    ? "Enter a full address that starts with https:// or http://."
    : undefined;
}

export function incomingReady(item: IncomingFile): boolean {
  return (
    item.status !== "uploading"
    && Boolean(item.title.trim())
    && Boolean(item.artist.trim())
    && Boolean(item.effectSlug)
    && !sourceError(item.sourceUrl)
  );
}

const RIGHTS_OPTIONS = STUDIO_SETTABLE_RIGHTS.map((status) => ({
  value: status,
  label: RIGHTS_STATUS_LABELS[status],
}));

function gapText(row: StudioRow): string {
  return replicationProvenanceGaps(row)
    .map((gap) => (gap === "rights" ? "a known rights status" : "a source"))
    .join(" and ");
}

export function IncomingTray({
  items,
  duplicates,
  waiting,
  effects,
  artists,
  busy = false,
  onPatch,
  onDiscard,
  onClear,
  onAdd,
  onAddAll,
  onPublish,
  onDismissWaiting,
}: IncomingTrayProps) {
  if (items.length === 0 && waiting.length === 0) {
    return null;
  }

  const effectOptions = [
    { value: "", label: "Effect" },
    ...effects.map((effect) => ({ value: effect.slug, label: effect.name })),
  ];

  const readyCount = items.filter(incomingReady).length;
  const publishable = waiting.filter((row) => replicationProvenanceGaps(row).length === 0);
  const blocked = waiting.filter((row) => replicationProvenanceGaps(row).length > 0);

  return (
    <EditorPanel role="region" aria-label="Incoming">
      <EditorPanelHeader
        eyebrow="Upload"
        title="Incoming"
        description="Uploading adds the file to the library unpublished; no public page shows it. Publish it once its rights status is known and its source is set."
        meta={<Badge variant="secondary">{items.length + waiting.length}</Badge>}
        actions={
          items.length > 0 ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                Clear tray
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={readyCount === 0}
                onClick={onAddAll}
              >
                Upload {readyCount}
              </Button>
            </>
          ) : null
        }
      />
      <EditorPanelBody className="space-y-3">
        {items.map((item) => {
          const itemBusy = item.status === "uploading";
          const matches = duplicates.get(item.id) ?? [];
          const lowResolution = item.size && isLowResolution(item.size.width, item.size.height);
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
                  {item.size ? ` · ${item.size.width} × ${item.size.height}` : ""}
                </div>

                {matches.length > 0 ? (
                  <Notice
                    tone="warning" title="Duplicate file" message={`The library already holds these exact bytes: ${matches.join(", ")}. Upload only if a second row is intended.`}
                  />
                ) : null}
                {lowResolution && item.size ? (
                  <Notice
                    tone="warning" title="Low resolution" message={`${item.size.width} × ${item.size.height} pixels. Works under ${LOW_RESOLUTION_MIN_EDGE} pixels on the short edge look soft in galleries.`}
                  />
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="Title" htmlFor={`${item.id}-title`}>
                    <Input
                      id={`${item.id}-title`}
                      inputSize="sm"
                      value={item.title}
                      disabled={itemBusy}
                      onChange={(event) => onPatch(item.id, { title: event.target.value })}
                    />
                  </EditorField>
                  <EditorField label="Artist" htmlFor={`${item.id}-artist`}>
                    <Input
                      id={`${item.id}-artist`}
                      inputSize="sm"
                      list="studio-incoming-artists"
                      value={item.artist}
                      disabled={itemBusy}
                      onChange={(event) => onPatch(item.id, { artist: event.target.value })}
                    />
                  </EditorField>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="Primary effect" htmlFor={`${item.id}-effect`}>
                    <EditorSelect
                      id={`${item.id}-effect`}
                      selectSize="sm"
                      value={item.effectSlug}
                      options={effectOptions}
                      disabled={itemBusy}
                      onChange={(event) => onPatch(item.id, { effectSlug: event.target.value })}
                    />
                  </EditorField>
                  <EditorField label="Rights status" htmlFor={`${item.id}-rights`}>
                    <EditorSelect
                      id={`${item.id}-rights`}
                      selectSize="sm"
                      value={item.rightsStatus}
                      options={RIGHTS_OPTIONS}
                      disabled={itemBusy}
                      onChange={(event) =>
                        onPatch(item.id, { rightsStatus: event.target.value as StudioRightsStatus })
                      }
                    />
                  </EditorField>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField
                    label="Source"
                    htmlFor={`${item.id}-source`}
                    error={sourceError(item.sourceUrl)}
                  >
                    <Input
                      id={`${item.id}-source`}
                      inputSize="sm"
                      type="url"
                      placeholder="https://"
                      value={item.sourceUrl}
                      disabled={itemBusy}
                      onChange={(event) => onPatch(item.id, { sourceUrl: event.target.value })}
                    />
                  </EditorField>
                  <EditorField label="Credit" htmlFor={`${item.id}-credit`}>
                    <Input
                      id={`${item.id}-credit`}
                      inputSize="sm"
                      placeholder="As it should appear beside the work"
                      value={item.creditLine}
                      disabled={itemBusy}
                      onChange={(event) => onPatch(item.id, { creditLine: event.target.value })}
                    />
                  </EditorField>
                </div>

                {item.error ? (
                  <p className="theme-danger-text text-sm">{item.error}</p>
                ) : null}
              </div>

              <div className="flex flex-row gap-2 sm:flex-col">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!incomingReady(item)}
                  onClick={() => onAdd(item)}
                >
                  {itemBusy ? "Uploading" : "Upload"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={itemBusy}
                  onClick={() => onDiscard(item.id)}
                >
                  Discard
                </Button>
              </div>
            </div>
          );
        })}

        {waiting.length > 0 ? (
          <section
            aria-label="Waiting to publish"
            className="space-y-2 rounded-xl border border-[color:var(--editor-panel-border)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="theme-text-secondary flex-1 text-sm font-medium">
                Uploaded, not yet published
              </h4>
              <Button type="button" variant="ghost" size="sm" onClick={onDismissWaiting}>
                Hide
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={busy || publishable.length === 0}
                onClick={() => onPublish(publishable)}
              >
                Publish {publishable.length}
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {publishable.map((row) => (
                <li key={row.id} className="theme-text-secondary">
                  {row.title} <span className="theme-text-faint">· ready to publish</span>
                </li>
              ))}
              {blocked.map((row) => (
                <li key={row.id} className="theme-text-secondary">
                  {row.title}{" "}
                  <span className="theme-text-faint">· needs {gapText(row)}; set it in the inspector</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <datalist id="studio-incoming-artists">
          {artists.map((artist) => (
            <option key={artist} value={artist} />
          ))}
        </datalist>
      </EditorPanelBody>
    </EditorPanel>
  );
}
