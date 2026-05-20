import { useCallback } from "react";

import { useDevNoticeChannels, type DevNotice } from "@/features/dev/notices/devNoticeLifecycle";
import type { ChangeNotice } from "./useDevModeChangeLog";

type NoticeChannel = "github" | "convex";

const toChangeNotice = (notice: DevNotice | null | undefined): ChangeNotice | null => {
  if (!notice) {
    return null;
  }
  return {
    type: notice.status,
    message: notice.message,
    actionHref: notice.actionHref,
    actionLabel: notice.actionLabel,
  };
};

export function useDevModeSaveNotices() {
  const { notices, publish, clear } = useDevNoticeChannels({
    github: null,
    convex: null,
  });

  const updateNotice = useCallback(
    (channel: NoticeChannel, notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => {
      if (!notice) {
        clear(channel);
        return;
      }
      publish({
        channel,
        status: notice.type,
        message: notice.message,
        actionHref: notice.actionHref,
        actionLabel: notice.actionLabel,
        autoClearMs: options?.clearAfterMs ?? null,
      });
    },
    [clear, publish],
  );

  const clearSaveNotices = useCallback(() => {
    clear("github");
    clear("convex");
  }, [clear]);

  return {
    githubNotice: toChangeNotice(notices.github),
    convexNotice: toChangeNotice(notices.convex),
    setGithubNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) =>
      updateNotice("github", notice, options),
    setConvexNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) =>
      updateNotice("convex", notice, options),
    clearSaveNotices,
  };
}
