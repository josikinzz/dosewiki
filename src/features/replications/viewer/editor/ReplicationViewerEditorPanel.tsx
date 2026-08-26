"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReplicationAssociation } from "@/features/dev/tools/replication-studio/replicationAssociationModel";
import type { ReplicationViewerEditorGateProps } from "./ReplicationViewerEditorGate";
import { SortableViewerRail } from "./SortableViewerRail";

type Playlist = {
  key: string;
  title: string;
  replication_slugs: string[];
  updated_at: string;
};

type SubstanceOption = {
  slug: string;
  title: string;
  match_count: number;
  curated: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type JsonRecord = Record<string, unknown>;

type OrderVersion = { order: string[]; updatedAt: string | null };
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok || payload.ok === false) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "The editor request failed.",
    );
  }
  return payload as T;
}

function SectionHeading({
  icon,
  title,
  detail,
}: {
  icon: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border theme-media-thumbnail-border theme-media-control-raised theme-media-tile-creator">
        <Icon icon={icon} className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold theme-media-tile-title">{title}</h3>
        {detail ? <p className="mt-0.5 text-xs leading-5 theme-media-tile-creator">{detail}</p> : null}
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2" aria-busy="true">
      {[0, 1].map((row) => (
        <div
          key={row}
          className="h-11 animate-pulse rounded-xl theme-media-control-raised motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function membershipLabel(association: ReplicationAssociation): string {
  if (association.curatedPosition !== null) return "Manual";
  if (association.matchedVia === "specific_drug") return "Exact drug";
  if (association.matchedVia === "drug_class") return "Drug class";
  if (association.matchedVia === "visual_disconnection") return "Visual fallback";
  return "Automatic";
}

export function ReplicationViewerEditorPanel(
  props: ReplicationViewerEditorGateProps,
) {
  const { collection, activeSlug, open, panelHost, railHost } = props;
  const target = collection.editorTarget;
  const group = collection.groups[0];
  const active = group?.items.find(
    (item) => item.replication.slug === activeSlug,
  );
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const createPlaylistInputRef = useRef<HTMLInputElement>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [substances, setSubstances] = useState<SubstanceOption[] | null>(null);
  const [associations, setAssociations] = useState<ReplicationAssociation[] | null>(null);
  const [orderVersion, setOrderVersion] = useState<OrderVersion | null>(null);
  const [drugQuery, setDrugQuery] = useState("");
  const [playlistQuery, setPlaylistQuery] = useState("");
  const [createPlaylist, setCreatePlaylist] = useState(false);
  const [createName, setCreateName] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (createPlaylist) createPlaylistInputRef.current?.focus();
  }, [createPlaylist]);

  useEffect(() => {
    if (!open) {
      setReorderMode(false);
      props.onReorderModeChange(false);
      return;
    }
    const controller = new AbortController();
    if (playlists === null) {
      void requestJson<{ playlists: Playlist[] }>("/api/dev/replications/playlists", {
        signal: controller.signal,
      })
        .then((result) => setPlaylists(result.playlists))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setMessage(error instanceof Error ? error.message : "Unable to load playlists.");
          }
        });
    }
    if (substances === null) {
      void requestJson<{ substances: SubstanceOption[] }>("/api/dev/replications/substances", {
        signal: controller.signal,
      })
        .then((result) => setSubstances(result.substances))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setMessage(error instanceof Error ? error.message : "Unable to load substances.");
          }
        });
    }
    return () => controller.abort();
  }, [open, playlists, props, substances]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setAssociations(null);
    void requestJson<{ associations: ReplicationAssociation[] }>(
      `/api/dev/replications/associations/${encodeURIComponent(activeSlug)}`,
      { signal: controller.signal },
    )
      .then((result) => setAssociations(result.associations))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Unable to load drug placements.");
        }
      });
    return () => controller.abort();
  }, [activeSlug, open]);

  useEffect(() => {
    if (!open || !target) return;
    const controller = new AbortController();
    setOrderVersion(null);
    const search = new URLSearchParams({
      targetKind: target.kind,
      targetKey: target.key.toLocaleLowerCase(),
    });
    void requestJson<{ target: OrderVersion }>(
      `/api/dev/replications/carousel-order?${search.toString()}`,
      { signal: controller.signal },
    )
      .then((result) => setOrderVersion(result.target))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the stored carousel order.",
          );
        }
      });
    return () => controller.abort();
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (createPlaylist) {
        event.preventDefault();
        event.stopPropagation();
        setCreatePlaylist(false);
        return;
      }
      if (reorderMode) {
        event.preventDefault();
        event.stopPropagation();
        setReorderMode(false);
        props.onReorderModeChange(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      props.onOpenChange(false);
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [createPlaylist, open, props, reorderMode]);

  const visibleSubstances = useMemo(() => {
    const query = drugQuery.trim().toLocaleLowerCase();
    if (!query || !substances) return [];
    return substances
      .filter(
        (substance) =>
          substance.title.toLocaleLowerCase().includes(query) ||
          substance.slug.includes(query),
      )
      .slice(0, 8);
  }, [drugQuery, substances]);

  const visiblePlaylists = useMemo(() => {
    const query = playlistQuery.trim().toLocaleLowerCase();
    if (!query || !playlists) return playlists?.slice(0, 6) ?? [];
    return playlists
      .filter(
        (playlist) =>
          playlist.title.toLocaleLowerCase().includes(query) ||
          playlist.key.includes(query),
      )
      .slice(0, 8);
  }, [playlistQuery, playlists]);

  if (!open || !target || !group || !active || !panelHost) return null;

  const markSaved = (text: string) => {
    setSaveState("saved");
    setMessage(text);
    window.setTimeout(() => {
      setSaveState((state) => (state === "saved" ? "idle" : state));
    }, 1800);
  };

  const updateDrug = async (substance: SubstanceOption, assigned: boolean) => {
    const previous = associations ?? [];
    setBusyKey(`drug:${substance.slug}`);
    setSaveState("saving");
    setMessage(null);
    if (!assigned) {
      setAssociations(previous.filter((row) => row.slug !== substance.slug));
    }
    try {
      const result = await requestJson<{ association: ReplicationAssociation | null }>(
        `/api/dev/replications/associations/${encodeURIComponent(activeSlug)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ substanceSlug: substance.slug, assigned }),
        },
      );
      setAssociations((current) => {
        const without = (current ?? []).filter((row) => row.slug !== substance.slug);
        return result.association
          ? [...without, result.association].sort((a, b) => a.title.localeCompare(b.title))
          : without;
      });
      setDrugQuery("");
      markSaved(assigned ? `Assigned to ${substance.title}.` : `Removed from ${substance.title}.`);
    } catch (error) {
      setAssociations(previous);
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to update that drug.");
    } finally {
      setBusyKey(null);
    }
  };

  const updatePlaylist = async (playlist: Playlist, included: boolean) => {
    if (!playlists) return;
    const previous = playlists;
    setBusyKey(`playlist:${playlist.key}`);
    setSaveState("saving");
    setMessage(null);
    setPlaylists(
      playlists.map((row) =>
        row.key === playlist.key
          ? {
              ...row,
              replication_slugs: included
                ? [...new Set([...row.replication_slugs, activeSlug])]
                : row.replication_slugs.filter((slug) => slug !== activeSlug),
            }
          : row,
      ),
    );
    try {
      const result = await requestJson<{ playlist: Playlist }>(
        `/api/dev/replications/playlists/${encodeURIComponent(playlist.key)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ slug: activeSlug, included }),
        },
      );
      setPlaylists((current) =>
        (current ?? []).map((row) =>
          row.key === playlist.key ? { ...row, ...result.playlist } : row,
        ),
      );
      markSaved(included ? `Added to ${playlist.title}.` : `Removed from ${playlist.title}.`);
    } catch (error) {
      setPlaylists(previous);
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to update that playlist.");
    } finally {
      setBusyKey(null);
    }
  };

  const createAndAssignPlaylist = async () => {
    const title = createName.trim();
    if (!title) return;
    const key = title
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!key) {
      setSaveState("error");
      setMessage("That name cannot produce a playlist key.");
      return;
    }
    setBusyKey("playlist:create");
    setSaveState("saving");
    setMessage(null);
    try {
      const result = await requestJson<{ playlist: Playlist }>(
        "/api/dev/replications/playlists",
        {
          method: "POST",
          body: JSON.stringify({ key, title, slugs: [activeSlug], expectedUpdatedAt: null }),
        },
      );
      setPlaylists((current) =>
        [...(current ?? []), result.playlist].sort((a, b) => a.title.localeCompare(b.title)),
      );
      setCreatePlaylist(false);
      setCreateName("");
      setPlaylistQuery("");
      markSaved(`Created ${title} and added this work.`);
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to create that playlist.");
    } finally {
      setBusyKey(null);
    }
  };

  const saveOrder = async (next: string[]) => {
    const previous = group.items.map((item) => item.replication.slug);
    props.onOrderChange(next);
    setSaveState("saving");
    setBusyKey("order");
    setMessage(null);
    try {
      const response = await requestJson<{
        result?: { status?: string; updated_at?: string };
      }>("/api/dev/replications/carousel-order", {
        method: "PATCH",
        body: JSON.stringify({
          targetKind: target.kind,
          targetKey: target.key.toLocaleLowerCase(),
          slugs: next,
          expectedOrder: orderVersion?.order,
          expectedUpdatedAt:
            target.kind === "substance" ? orderVersion?.updatedAt : undefined,
        }),
      });
      if (response.result?.status === "conflict") {
        throw new Error(
          "This carousel changed elsewhere. Close and reopen the editor to refresh it.",
        );
      }
      setOrderVersion({
        order: next,
        updatedAt:
          response.result?.updated_at ?? orderVersion?.updatedAt ?? null,
      });
      markSaved("Carousel order saved.");
    } catch (error) {
      props.onOrderChange(previous);
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Unable to save that order.");
    } finally {
      setBusyKey(null);
    }
  };

  const panel = (
    <section
      ref={panelRef}
      role="complementary"
      aria-labelledby={headingId}
      className="flex h-full min-h-0 flex-col bg-black/95 theme-media-tile-title"
    >
      <header className="sticky top-0 z-10 border-b theme-media-thumbnail-border bg-black/95 px-5 py-4 backdrop-blur-md motion-reduce:backdrop-blur-none">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] theme-accent-emphasis">
              Editing carousel
            </p>
            <h2 id={headingId} className="mt-1 truncate font-display text-lg font-semibold">
              {target.label}
            </h2>
            <p className="mt-1 truncate text-xs theme-media-tile-creator">
              {active.replication.title} · {group.items.length} works
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close carousel editor"
            onClick={() => props.onOpenChange(false)}
            className="size-11 rounded-full theme-media-tile-creator theme-media-settings-item hover:opacity-100"
          >
            <Icon icon="lucide:x" className="size-5" aria-hidden />
          </Button>
        </div>
        <div className="mt-3 min-h-5 text-xs" aria-live="polite">
          {saveState === "saving" ? (
            <span className="inline-flex items-center gap-2 theme-media-tile-creator">
              <Icon icon="lucide:loader-circle" className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Saving…
            </span>
          ) : message ? (
            <span className={saveState === "error" ? "text-red-300" : "theme-media-tile-creator"}>
              {message}
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <section className="space-y-3" aria-labelledby={`${headingId}-drug`}>
          <SectionHeading
            icon="lucide:pill"
            title="Drug article"
            detail="Place this work on a specific substance slideshow."
          />
          <div id={`${headingId}-drug`} className="sr-only">Drug article assignment</div>
          {associations === null ? (
            <LoadingRows />
          ) : associations.filter((row) => !row.excluded).length > 0 ? (
            <div className="space-y-2">
              {associations
                .filter((row) => !row.excluded)
                .map((association) => (
                  <div
                    key={association.slug}
                    className="flex min-h-11 items-center gap-2 rounded-xl border theme-media-thumbnail-border theme-media-control-raised px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{association.title}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] theme-media-tile-creator">
                      {membershipLabel(association)}
                    </Badge>
                    {association.curatedPosition !== null ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busyKey !== null}
                        aria-label={`Remove from ${association.title}`}
                        onClick={() =>
                          void updateDrug(
                            {
                              slug: association.slug,
                              title: association.title,
                              match_count: 0,
                              curated: true,
                            },
                            false,
                          )
                        }
                        className="size-8 theme-media-tile-creator hover:opacity-100"
                      >
                        <Icon icon="lucide:x" className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs theme-media-tile-creator">No substance placement.</p>
          )}
          <label className="block text-xs font-medium theme-media-tile-creator" htmlFor={`${headingId}-drug-search`}>
            Assign to a drug
          </label>
          <Input
            id={`${headingId}-drug-search`}
            type="search"
            value={drugQuery}
            onChange={(event) => setDrugQuery(event.target.value)}
            placeholder="Search substances…"
            autoComplete="off"
            disabled={busyKey !== null}
            className="theme-media-thumbnail-border theme-media-control-raised theme-media-tile-title"
          />
          {drugQuery.trim() ? (
            <div className="max-h-64 overflow-y-auto rounded-xl border theme-media-thumbnail-border bg-black/70 p-1">
              {visibleSubstances.length > 0 ? (
                visibleSubstances.map((substance) => {
                  const present = associations?.some(
                    (association) => association.slug === substance.slug && !association.excluded,
                  );
                  return (
                    <Button
                      key={substance.slug}
                      type="button"
                      variant="listItem"
                      size="listItem"
                      disabled={busyKey !== null || present}
                      onClick={() => void updateDrug(substance, true)}
                      className="min-h-11 theme-media-tile-creator theme-media-settings-item"
                    >
                      <span className="min-w-0 flex-1 truncate">{substance.title}</span>
                      {present ? <Icon icon="lucide:check" className="size-4 theme-accent-emphasis" aria-label="Assigned" /> : null}
                    </Button>
                  );
                })
              ) : (
                <p className="px-3 py-4 text-xs theme-media-tile-creator">No matching substances.</p>
              )}
            </div>
          ) : null}
        </section>

        <div className="my-7 border-t theme-media-thumbnail-border" />

        <section className="space-y-3" aria-labelledby={`${headingId}-playlists`}>
          <SectionHeading
            icon="lucide:list-music"
            title="Playlists"
            detail="Add this work to one or more reusable collections."
          />
          <div id={`${headingId}-playlists`} className="sr-only">Playlist membership</div>
          <Input
            type="search"
            value={playlistQuery}
            onChange={(event) => {
              setPlaylistQuery(event.target.value);
              setCreatePlaylist(false);
            }}
            placeholder="Search playlists…"
            aria-label="Search playlists"
            autoComplete="off"
            disabled={busyKey !== null}
            className="theme-media-thumbnail-border theme-media-control-raised theme-media-tile-title"
          />
          {playlists === null ? (
            <LoadingRows />
          ) : (
            <div className="space-y-1">
              {visiblePlaylists.map((playlist) => {
                const included = playlist.replication_slugs.includes(activeSlug);
                return (
                  <Button
                    key={playlist.key}
                    type="button"
                    variant="listItem"
                    size="listItem"
                    disabled={busyKey !== null}
                    aria-pressed={included}
                    onClick={() => void updatePlaylist(playlist, !included)}
                    className="min-h-11 theme-media-tile-creator theme-media-settings-item"
                  >
                    <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
                    <span className="text-[10px] theme-media-tile-creator">{playlist.replication_slugs.length}</span>
                    <Icon
                      icon={included ? "lucide:check-circle-2" : "lucide:circle"}
                      className={cn(
                        "size-4",
                        included ? "theme-accent-emphasis" : "theme-media-tile-creator",
                      )}
                      aria-hidden
                    />
                  </Button>
                );
              })}
            </div>
          )}
          {playlistQuery.trim() &&
          !playlists?.some(
            (playlist) =>
              playlist.title.toLocaleLowerCase() === playlistQuery.trim().toLocaleLowerCase(),
          ) ? (
            createPlaylist ? (
              <div className="space-y-2 rounded-xl border theme-media-thumbnail-border theme-media-control-raised p-3">
                <label className="text-xs font-medium theme-media-tile-creator" htmlFor={`${headingId}-new-playlist`}>
                  Playlist name
                </label>
                <Input
                  id={`${headingId}-new-playlist`}
                  ref={createPlaylistInputRef}
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="New playlist"
                  className="theme-media-thumbnail-border bg-black/30 theme-media-tile-title"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCreatePlaylist(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    disabled={!createName.trim() || busyKey !== null}
                    onClick={() => void createAndAssignPlaylist()}
                  >
                    Create & add
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => {
                  setCreateName(playlistQuery.trim());
                  setCreatePlaylist(true);
                }}
                className="w-full justify-start border-dashed theme-media-thumbnail-border theme-media-tile-creator"
              >
                <Icon icon="lucide:plus" className="size-4" aria-hidden />
                Create “{playlistQuery.trim()}”
              </Button>
            )
          ) : null}
        </section>

        <div className="my-7 border-t theme-media-thumbnail-border" />

        <section className="space-y-4 pb-2">
          <SectionHeading
            icon="lucide:gallery-horizontal-end"
            title="Carousel order"
            detail={`${group.items.length} works · exact order for this ${target.kind}.`}
          />
          <Button
            type="button"
            variant={reorderMode ? "accent" : "outline"}
            size="lg"
            disabled={busyKey !== null || orderVersion === null}
            aria-pressed={reorderMode}
            onClick={() => {
              const next = !reorderMode;
              setReorderMode(next);
              props.onReorderModeChange(next);
            }}
            className="w-full"
          >
            <Icon
              icon={reorderMode ? "lucide:check" : "lucide:grip-horizontal"}
              className="size-4"
              aria-hidden
            />
            {reorderMode
              ? "Done reordering"
              : orderVersion
                ? "Reorder thumbnails"
                : "Loading order…"}
          </Button>
          {reorderMode ? (
            <p className="text-xs leading-5 theme-media-tile-creator">
              The existing rail is now sortable. Drag a handle, or focus one and use Space with the arrow keys.
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );

  return (
    <>
      {createPortal(panel, panelHost)}
      {reorderMode && railHost
        ? createPortal(
            <SortableViewerRail
              items={group.items}
              activeSlug={activeSlug}
              disabled={busyKey !== null}
              onActivate={props.onActivateSlug}
              onReorder={(slugs) => void saveOrder(slugs)}
            />,
            railHost,
          )
        : null}
    </>
  );
}
