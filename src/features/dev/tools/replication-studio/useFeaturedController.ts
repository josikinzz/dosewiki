"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useUnsavedWork,
  type EditorActionStatusState,
} from "@/features/dev/components";
import type { OrderablePanelItem } from "@/features/dev/tools/contributors/OrderingPanel";

import { readReplicationApiError as readError } from "./replicationStudioApi";
import type { StudioRow } from "./replicationStudioModel";
import type { StudioFeedback } from "./useReplicationCorpus";

const FEATURED_API = "/api/dev/replications/featured";

/**
 * The Featured workspace: the Effect Index homepage carousel's order. It
 * loads the first time the workspace opens, and its unsaved order reports
 * to the shell. A save goes live, so the shell only discards it.
 */
export function useFeaturedController({
  active,
  rows,
  visibleRows,
  setFeedback,
}: {
  active: boolean;
  rows: readonly StudioRow[];
  visibleRows: readonly StudioRow[];
  setFeedback: (feedback: StudioFeedback | null) => void;
}) {
  const [order, setOrderState] = useState<string[]>([]);
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [curated, setCurated] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<EditorActionStatusState | "idle">("idle");

  const load = useCallback(async () => {
    try {
      const response = await fetch(FEATURED_API);
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: await readError(response, "Failed to load the featured selection."),
        });
        return;
      }
      const payload = (await response.json()) as { slugs: string[]; curated: boolean };
      setOrderState(payload.slugs);
      setSavedOrder(payload.slugs);
      setCurated(payload.curated);
      setLoaded(true);
    } catch {
      setFeedback({ tone: "danger", message: "Could not reach the server to load featured replications." });
    }
  }, [setFeedback]);

  useEffect(() => {
    if (active && !loaded) void load();
  }, [active, loaded, load]);

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const response = await fetch(FEATURED_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: order }),
      });
      if (!response.ok) {
        setSaveState("error");
        setFeedback({
          tone: "danger",
          message: await readError(response, "Saving the featured selection failed."),
        });
        return;
      }
      const payload = (await response.json()) as { slugs: string[]; pruned: string[] };
      setOrderState(payload.slugs);
      setSavedOrder(payload.slugs);
      setCurated(true);
      setSaveState("saved");
      setFeedback({
        tone: "success",
        message:
          payload.pruned.length > 0
            ? `Featured ${payload.slugs.length} replications. Dropped ${payload.pruned.length} slug(s) that no longer resolve: ${payload.pruned.join(", ")}.`
            : `Featured ${payload.slugs.length} replications on the Effect Index homepage.`,
      });
    } catch {
      setSaveState("error");
      setFeedback({
        tone: "danger",
        message: "Saving failed: the server could not be reached.",
      });
    }
  }, [order, setFeedback]);

  const setOrder = useCallback((next: string[]) => {
    setOrderState(next);
    setSaveState("idle");
  }, []);
  const reset = useCallback(() => setOrder(savedOrder), [savedOrder, setOrder]);

  /** The chosen works first, then everything the Library's filters leave, once each. */
  const items = useMemo<OrderablePanelItem[]>(() => {
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const chosen = order
      .map((slug) => bySlug.get(slug))
      .filter((row): row is StudioRow => Boolean(row));
    const listed = new Set<string>();
    return [...chosen, ...visibleRows]
      .filter((row) => {
        if (listed.has(row.slug)) return false;
        listed.add(row.slug);
        return true;
      })
      .map((row) => ({
        slug: row.slug,
        title: row.title,
        meta: [row.artist, row.effect_name ?? row.effect_slug ?? "no effect", row.type]
          .filter(Boolean)
          .join(" · "),
      }));
  }, [order, rows, visibleRows]);

  const dirty =
    loaded &&
    (order.length !== savedOrder.length || order.some((slug, index) => slug !== savedOrder[index]));
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: "replications/featured",
    tab: "replications",
    label: "Replications: Featured order",
    dirty,
    discard: reset,
  });

  return { loaded, curated, order, savedOrder, items, saveState, setOrder, reset, save };
}
