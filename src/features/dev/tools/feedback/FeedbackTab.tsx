"use client";

import { useRef, useState } from "react";

import { EditorSegmentedControl } from "@/features/dev/components";
import { getDevTabHeading } from "@/features/dev/pages/devTabRegistry";
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

const SOURCE_DESCRIPTION: Record<FeedbackSource, string> = {
  article: "Sent from the feedback form at the end of each article.",
  site: "Sent from the site feedback form: requests, bugs, design, speed and accessibility.",
};

const TOOL_HEADING = {
  ...getDevTabHeading("article-feedback"),
  description: "Private reports from readers: resolve, reject or correct each one. None of it is public.",
};

export function FeedbackTab({
  initialSource,
  initialId,
  actorEmail = null,
}: {
  initialSource?: string;
  initialId?: string;
  actorEmail?: string | null;
}) {
  const [source, setSource] = useState<FeedbackSource>(initialSource === "site" ? "site" : "article");
  const pendingBySource = useDevRailBadgeParts("feedback");
  const [fromUrl] = useState(() =>
    typeof window === "undefined"
      ? { status: null, sort: null, search: "" }
      : readFeedbackTaskParams(window.location.search),
  );
  const [statusFilter, setStatusFilter] = useState<FeedbackQueueFilter | null>(fromUrl.status);
  const [queueStart, setQueueStart] = useState<FeedbackQueueContext>(() => ({
    sort: fromUrl.sort,
    search: fromUrl.search,
    selectedId: decodeTaskId(initialId),
  }));
  const context = useRef<FeedbackQueueContext>(queueStart);

  function writeUrl(nextSource: FeedbackSource, nextStatus: FeedbackQueueFilter | null) {
    const { sort, search, selectedId } = context.current;
    window.history.replaceState(
      window.history.state,
      "",
      feedbackTaskHref({ source: nextSource, id: selectedId, status: nextStatus, sort, search }),
    );
  }

  function selectSource(next: FeedbackSource) {
    setSource(next);
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
      <p className="theme-text-muted min-w-0 text-sm">{SOURCE_DESCRIPTION[source]}</p>
    </div>
  );

  const queueProps = {
    heading: TOOL_HEADING,
    actorEmail,
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
