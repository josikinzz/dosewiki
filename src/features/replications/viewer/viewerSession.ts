import {
  findViewerPosition,
  moveViewerGroup,
  moveViewerWork,
  type ReplicationViewerCollection,
  type ReplicationViewerPosition,
} from "./viewerModel";

/** Non-swipe selections may fade; both swipe axes animate in the track. */
export type EntryMotion = "fade";

export interface ViewerHistoryAdapter {
  push(url: string): void;
  replace(url: string): void;
  back(): void;
  viewerStateActive(): boolean;
}

export interface ViewerSessionSnapshot {
  position: ReplicationViewerPosition | null;
  entry: EntryMotion | null;
}

interface ViewerSessionOptions {
  collection: ReplicationViewerCollection;
  initialSlug: string;
  history: ViewerHistoryAdapter;
  buildUrl: (source: string, slug: string) => string;
  closeUrl: (source: string) => string;
  currentSource: () => string;
  onChange: (snapshot: ViewerSessionSnapshot) => void;
}
export interface ViewerSession {
  open(slug: string, entry?: EntryMotion | null): void;
  commitWork(direction: 1 | -1): void;
  commitGroup(direction: 1 | -1): void;
  adjacentGroup(direction: 1 | -1): ReplicationViewerPosition | null;
  regroup(grouping: "artist" | "effect", currentSlug: string): void;
  applyOrder(slugs: readonly string[]): void;
  setCollection(collection: ReplicationViewerCollection): void;
  syncFromUrl(slug: string | null): void;
  close(): void;
  snapshot(): ViewerSessionSnapshot;
}


export function createViewerSession(
  options: ViewerSessionOptions,
): ViewerSession {
  let collection = options.collection;
  let position = findViewerPosition(collection, options.initialSlug);
  let entry: EntryMotion | null = null;
  const rememberedSlugByGroup: Record<string, string> = {};

  const remember = () => {
    if (!position) return;
    const group = collection.groups[position.groupIndex];
    const item = group?.items[position.itemIndex];
    if (group && item) rememberedSlugByGroup[group.key] = item.replication.slug;
  };

  const emit = () => {
    remember();
    options.onChange({ position, entry });
  };

  const land = (
    next: ReplicationViewerPosition | null,
    nextEntry: EntryMotion | null,
    historyMode: "push" | "replace" = "replace",
  ) => {
    if (!next) return;
    const item = collection.groups[next.groupIndex]?.items[next.itemIndex];
    if (!item) return;
    position = next;
    entry = nextEntry;
    emit();
    options.history[historyMode](
      options.buildUrl(options.currentSource(), item.replication.slug),
    );
  };

  remember();

  return {
    open(slug: string, nextEntry: EntryMotion | null = null) {
      land(
        findViewerPosition(collection, slug),
        nextEntry,
        options.history.viewerStateActive() ? "replace" : "push",
      );
    },
    commitWork(direction: 1 | -1) {
      if (!position) return;
      land(moveViewerWork(collection, position, direction), null);
    },
    commitGroup(direction: 1 | -1) {
      if (!position) return;
      land(
        moveViewerGroup(collection, position, direction, rememberedSlugByGroup),
        null,
      );
    },
    adjacentGroup(direction: 1 | -1) {
      return position
        ? moveViewerGroup(collection, position, direction, rememberedSlugByGroup)
        : null;
    },
    regroup(grouping: "artist" | "effect", currentSlug: string) {
      if (collection.grouping === grouping) return;
      land(findViewerPosition(collection, currentSlug), "fade");
    },
    applyOrder(slugs: readonly string[]) {
      if (!position) return;
      const currentGroup = collection.groups[position.groupIndex];
      const active = currentGroup?.items[position.itemIndex];
      if (!currentGroup || !active) return;
      const bySlug = new Map(
        currentGroup.items.map((item) => [item.replication.slug, item]),
      );
      const ordered = slugs.flatMap((slug) => {
        const item = bySlug.get(slug);
        if (!item) return [];
        bySlug.delete(slug);
        return [item];
      });
      ordered.push(...bySlug.values());
      currentGroup.items.splice(0, currentGroup.items.length, ...ordered);
      position = {
        groupIndex: position.groupIndex,
        itemIndex: ordered.findIndex(
          (item) => item.replication.slug === active.replication.slug,
        ),
      };
      entry = "fade";
      emit();
    },
    setCollection(nextCollection: ReplicationViewerCollection) {
      const slug = position
        ? collection.groups[position.groupIndex]?.items[position.itemIndex]
            ?.replication.slug
        : null;
      collection = nextCollection;
      position = slug ? findViewerPosition(collection, slug) : null;
      emit();
    },
    syncFromUrl(slug: string | null) {
      if (!slug) return;
      const next = findViewerPosition(collection, slug);
      if (!next) return;
      position = next;
      entry = null;
      emit();
    },
    close() {
      if (options.history.viewerStateActive()) {
        options.history.back();
      } else {
        options.history.replace(options.closeUrl(options.currentSource()));
      }
    },
    snapshot(): ViewerSessionSnapshot {
      return { position, entry };
    },
  };
}
