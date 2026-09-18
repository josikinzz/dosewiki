"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { DEV_TAB_REGISTRY, type DevTabDescriptor } from "./devTabRegistry";

/** A named count source a descriptor can declare; the rail renders it as a badge. */
export type DevRailBadge = NonNullable<DevTabDescriptor["badge"]>;

/** Counts the rail shows right now, keyed by badge name; absent while unknown or zero. */
export type DevRailBadgeCounts = Readonly<Partial<Record<DevRailBadge, number>>>;

/** Where each badge's count comes from, and which field of the JSON answer holds it. */
const BADGE_SOURCES: Record<DevRailBadge, { url: string; field: string }> = {
  "trip-reports": { url: "/api/dev/trip-reports/needs-review-count", field: "count" },
  feedback: { url: "/api/feedback/pending-count", field: "total" },
  proposals: { url: "/api/dev/proposals/count", field: "submitted" },
};

const BADGES = Object.keys(BADGE_SOURCES) as DevRailBadge[];

/** The badged tab's role floor: a member below it never asks for that count. */
const BADGE_FLOORS = Object.fromEntries(
  DEV_TAB_REGISTRY.flatMap((tab) => (tab.badge ? [[tab.badge, tab.role]] : [])),
) as Record<DevRailBadge, DevTabDescriptor["role"]>;

type BadgeEntry = {
  /** Last count the rail saw; null until the endpoint has answered once. */
  count: number | null;
  /** Bumped by every invalidation; a mounted rail refetches when it changes. */
  generation: number;
};

type BadgeSnapshot = Readonly<Record<DevRailBadge, BadgeEntry>>;

const INITIAL_SNAPSHOT: BadgeSnapshot = {
  "trip-reports": { count: null, generation: 0 },
  feedback: { count: null, generation: 0 },
  proposals: { count: null, generation: 0 },
};

/**
 * Plain module store, read through `useSyncExternalStore`. Lives outside React
 * so moving between dev tools does not make a badge blink away and back, and
 * so a tool can tell the rail that a count it painted is stale.
 */
let snapshot: BadgeSnapshot = INITIAL_SNAPSHOT;
let activeOwner: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mark one painted count stale. Every tool transition that can move a row in
 * or out of the counted bucket calls this; any mounted rail refetches that
 * badge and only that badge.
 */
export function invalidateDevRailBadge(badge: DevRailBadge) {
  const entry = snapshot[badge];
  snapshot = { ...snapshot, [badge]: { ...entry, generation: entry.generation + 1 } };
  emit();
}

export function resetDevRailBadgesForTests() {
  activeOwner = null;
  snapshot = INITIAL_SNAPSHOT;
  emit();
}

async function loadCount(badge: DevRailBadge, generation: number, owner: string) {
  const source = BADGE_SOURCES[badge];
  try {
    const response = await fetch(source.url);
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const count = payload[source.field];
    // An invalidation raced this answer: the refetch it triggered wins.
    if (typeof count !== "number" || activeOwner !== owner || snapshot[badge].generation !== generation) {
      return;
    }

    snapshot = { ...snapshot, [badge]: { count, generation } };
    emit();
  } catch {
    // A missing badge is the correct failure mode: the rail still works.
  }
}

/**
 * How much work is waiting inside each badged tool.
 *
 * Deliberately not part of the shell's first render path: it starts at whatever
 * a previous visit cached (or nothing), fetches in the background, and a tab
 * simply gains a badge when its answer arrives. A tool count is never worth
 * delaying the rail the editor is trying to click.
 *
 * This lives beside the shell rather than inside any tool so the rail does not
 * pull a tool's bundle into first paint.
 */
export function useDevRailBadges(role: AppRole | null, actorEmail?: string | null): DevRailBadgeCounts {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL_SNAPSHOT);
  // Generations this mount has already asked for; a remount asks again.
  const requestedRef = useRef<Partial<Record<DevRailBadge, number>>>({});
  const owner = `${role ?? "signed-out"}:${actorEmail ?? ""}`;

  useEffect(() => {
    if (activeOwner !== owner) {
      activeOwner = owner;
      snapshot = INITIAL_SNAPSHOT;
      requestedRef.current = {};
      emit();
    }
    for (const badge of BADGES) {
      if (!roleMeetsFloor(role, BADGE_FLOORS[badge])) {
        continue;
      }
      const { generation } = snapshot[badge];
      if (requestedRef.current[badge] === generation) {
        continue;
      }
      requestedRef.current[badge] = generation;
      void loadCount(badge, generation, owner);
    }
  }, [role, current, owner]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      for (const badge of BADGES) {
        if (roleMeetsFloor(role, BADGE_FLOORS[badge])) invalidateDevRailBadge(badge);
      }
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [role, owner]);

  const counts: Partial<Record<DevRailBadge, number>> = {};
  for (const badge of BADGES) {
    if (activeOwner !== owner || !roleMeetsFloor(role, BADGE_FLOORS[badge])) continue;
    const { count } = current[badge];
    if (count !== null && count > 0) {
      counts[badge] = count;
    }
  }
  return counts;
}
