"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicationReceipt } from "@server/next/publicationDispatch";
import type { PublicationTarget } from "@server/next/publicationWire";
import type { PublicationStatus } from "@server/next/publicationOutbox";
import { publicationDelivery, type PublicationDelivery } from "@/features/article/editing/publicationNotice";

export type PublicationReceiptState = {
  host: "saved";
  public: PublicationDelivery;
  translations: "queued" | "pending" | "not-needed" | "unknown";
  checking: boolean;
  stopped: boolean;
};

type RouteReceipt = readonly Pick<PublicationReceipt, "status" | "verification" | "translationIntent">[] | { status?: string } | null | undefined;

export const PUBLICATION_STATUS_ENDPOINT = "/api/dev/publication-status";
const DEFAULT_INTERVAL_MS = 4_000;
const DEFAULT_MAX_POLLS = 75;

function initialTranslations(receipts: RouteReceipt): PublicationReceiptState["translations"] {
  if (!Array.isArray(receipts)) return "unknown";
  const statuses = receipts.map((receipt) => receipt.translationIntent?.translationStatus).filter(Boolean);
  if (statuses.length === 0) return "unknown";
  return statuses.every((status) => status === "enqueued" || status === "generated") ? "queued" : "pending";
}

export function summarizePublicationStatuses(
  rows: readonly PublicationStatus[],
): Pick<PublicationReceiptState, "public" | "translations"> {
  const present = rows.filter((row) => row.state !== "missing");
  const publicState: PublicationDelivery = present.length === 0 ? "unknown"
    : present.some((row) => row.state === "failed") ? "failed"
      : present.every((row) => row.state === "delivered") ? "done" : "pending";
  const translatable = rows.filter((row) => row.translations !== "not-needed");
  const translations = translatable.length === 0 ? "not-needed"
    : translatable.every((row) => row.translations === "queued") ? "queued" : "pending";
  return { public: publicState, translations };
}

function isStatusRows(value: unknown): value is PublicationStatus[] {
  return Array.isArray(value) && value.every((row) => row && typeof row === "object"
    && typeof (row as PublicationStatus).key === "string"
    && ["pending", "delivered", "failed", "missing"].includes((row as PublicationStatus).state)
    && ["queued", "pending", "not-needed"].includes((row as PublicationStatus).translations));
}

export function usePublicationReceipt(options: { intervalMs?: number; maxPolls?: number } = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const [receipt, setReceipt] = useState<PublicationReceiptState | null>(null);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    run.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const reset = useCallback(() => { stop(); setReceipt(null); }, [stop]);

  const start = useCallback((targets: readonly PublicationTarget[], routeReceipt?: RouteReceipt) => {
    stop();
    const current = run.current;
    const single = routeReceipt && !Array.isArray(routeReceipt) ? routeReceipt as { status?: unknown } : null;
    const receipts = Array.isArray(routeReceipt) ? routeReceipt
      : single && typeof single.status === "string" ? [single as Pick<PublicationReceipt, "status">] : null;
    const initial = publicationDelivery(receipts);
    const settled = initial === "done" || initial === "failed";
    const canPoll = targets.length > 0 && !settled;
    setReceipt({ host: "saved", public: initial, translations: initialTranslations(routeReceipt), checking: canPoll, stopped: false });
    if (!canPoll) return;
    const query = targets.map((target) => `target=${encodeURIComponent(JSON.stringify(target))}`).join("&");
    let polls = 0;
    const poll = async () => {
      if (run.current !== current) return;
      polls += 1;
      let next: Pick<PublicationReceiptState, "public" | "translations"> | null = null;
      try {
        const response = await fetch(`${PUBLICATION_STATUS_ENDPOINT}?${query}`, { cache: "no-store" });
        const body = await response.json() as { publications?: unknown };
        if (response.ok && isStatusRows(body.publications)) next = summarizePublicationStatuses(body.publications);
      } catch {
      }
      if (run.current !== current) return;
      const final = next !== null && (next.public === "done" || next.public === "failed");
      const exhausted = !final && polls >= maxPolls;
      setReceipt((previous) => previous && {
        ...previous,
        ...(next && next.public !== "unknown" ? { public: next.public } : {}),
        ...(next && next.translations ? { translations: next.translations } : {}),
        checking: !final && !exhausted,
        stopped: exhausted,
      });
      if (!final && !exhausted) timer.current = setTimeout(() => { void poll(); }, intervalMs);
    };
    timer.current = setTimeout(() => { void poll(); }, intervalMs);
  }, [intervalMs, maxPolls, stop]);

  return { receipt, start, reset };
}
