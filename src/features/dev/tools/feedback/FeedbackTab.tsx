"use client";

import { useRef, useState } from "react";

import { EditorSegmentedControl } from "@/features/dev/components";
import { useDevRailBadgeParts } from "@/features/dev/pages/useDevRailBadges";

import { articleFeedbackAdapter } from "./articleFeedbackAdapter";
import {
  FeedbackReviewQueue,
  type FeedbackDraftGuard,
  type FeedbackQueueContext,
  type FeedbackQueueFilter,
} from "./FeedbackReviewQueue";
import {
  decodeTaskId,
  feedbackTaskHref,
  readFeedbackTaskParams,
  type FeedbackSource,
} from "./feedbackTaskLink";
import { siteFeedbackAdapter } from "./siteFeedbackAdapter";

export type { FeedbackSource } from "./feedbackTaskLink";

const SOURCE_OPTIONS: { value: FeedbackSource; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "site", label: "Site" },
];

/**
 * One Feedback tab over both reader intakes. The source filter picks the
 * adapter; the queue itself does not know which source it is showing.
 *
 * The queue is keyed by source so switching remounts it: a half-typed note,
 * a pending transition, or a list still loading for the old source never
 * carries into the new one. The status filter lives here, above the remount,
 * so an editor working through New rows stays on New across both sources.
 *
 * Each source option carries its pending count (New plus Reviewing), read from
 * the rail badge's own answer, so the badge total and the two options always
 * add up. The counts stay hidden until the rail has loaded them.
 *
 * The address is the task link (`feedbackTaskLink`): the item in the path,
 * `?source=`, `?status=`, `?sort=` and a shareable `?q=` in the query. A
 * reload, a copied link, or coming back from the article opens the same item
 * in the same queue. The retired `/dev/site-feedback` address presets the
 * source through the registry's filter segments. The route resolves `source`
 * and the item on the server; the client-only tab reads the rest in its lazy
 * initial state before first render. Writes go through native history rather
 * than the router: the filters are client-only state, so a server round trip
 * would buy nothing.
 */
export function FeedbackTab({ initialSource, initialId }: { initialSource?: string; initialId?: string }) {
  const [source, setSource] = useState<FeedbackSource>(initialSource === "site" ? "site" : "article");
  const pendingBySource = useDevRailBadgeParts("feedback");
  const [fromUrl] = useState(() =>
    typeof window === "undefined"
      ? { status: null, sort: null, search: "" }
      : readFeedbackTaskParams(window.location.search),
  );
  const [statusFilter, setStatusFilter] = useState<FeedbackQueueFilter | null>(fromUrl.status);
  /** What the queue opens on; a source switch starts the new queue clean. */
  const [queueStart, setQueueStart] = useState<FeedbackQueueContext>(() => ({
    sort: fromUrl.sort,
    search: fromUrl.search,
    selectedId: decodeTaskId(initialId),
  }));
  /** The queue's own context as it changes, kept for the next address write. */
  const context = useRef<FeedbackQueueContext>(queueStart);

  function writeUrl(nextSource: FeedbackSource, nextStatus: FeedbackQueueFilter | null) {
    const { sort, search, selectedId } = context.current;
    window.history.replaceState(
      null,
      "",
      feedbackTaskHref({ source: nextSource, id: selectedId, status: nextStatus, sort, search }),
    );
  }

  function selectSource(next: FeedbackSource) {
    setSource(next);
    // The item, order and search belong to the queue being left.
    context.current = { sort: null, search: "", selectedId: null };
    setQueueStart(context.current);
    writeUrl(next, statusFilter);
  }

  function selectStatus(next: FeedbackQueueFilter) {
    setStatusFilter(next);
    writeUrl(source, next);
  }

  function changeContext(next: FeedbackQueueContext) {
    context.current = next;
    writeUrl(source, statusFilter);
  }

  const taskLinkFor = (id: string) =>
    feedbackTaskHref({ source, status: statusFilter, sort: context.current.sort, search: context.current.search, id });

  const sourceFilter = (guard: FeedbackDraftGuard) => (
    <EditorSegmentedControl
      label="Feedback source"
      options={SOURCE_OPTIONS.map((option) => {
        const pending = pendingBySource?.[option.value];
        return pending === undefined ? option : { ...option, badge: String(pending) };
      })}
      value={source}
      onChange={(value) => {
        if (value !== source) {
          guard(() => selectSource(value as FeedbackSource));
        }
      }}
    />
  );

  const queueProps = {
    headerActions: sourceFilter,
    statusFilter,
    onStatusFilterChange: selectStatus,
    initialSelectedId: queueStart.selectedId,
    initialSort: queueStart.sort,
    initialSearch: queueStart.search,
    onContextChange: changeContext,
    taskLinkFor,
  };

  return source === "site" ? (
    <FeedbackReviewQueue key={source} adapter={siteFeedbackAdapter} {...queueProps} />
  ) : (
    <FeedbackReviewQueue key={source} adapter={articleFeedbackAdapter} {...queueProps} />
  );
}
