import { useCallback, useRef, useState } from "react";

import type { ChangeNotice } from "./useDevModeChangeLog";

type NoticeChannel = "github" | "convex";

export function useDevModeSaveNotices() {
  const [githubNotice, setGithubNotice] = useState<ChangeNotice | null>(null);
  const [convexNotice, setConvexNotice] = useState<ChangeNotice | null>(null);
  const timeoutRefs = useRef<Record<NoticeChannel, number | null>>({
    github: null,
    convex: null,
  });

  const clearNoticeTimeout = useCallback((channel: NoticeChannel) => {
    const timeoutId = timeoutRefs.current[channel];
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutRefs.current[channel] = null;
    }
  }, []);

  const scheduleClearNotice = useCallback(
    (channel: NoticeChannel, delayMs: number) => {
      clearNoticeTimeout(channel);
      timeoutRefs.current[channel] = window.setTimeout(() => {
        if (channel === "github") {
          setGithubNotice(null);
        } else {
          setConvexNotice(null);
        }
        timeoutRefs.current[channel] = null;
      }, delayMs);
    },
    [clearNoticeTimeout],
  );

  const updateNotice = useCallback(
    (channel: NoticeChannel, notice: ChangeNotice | null, options?: { clearAfterMs?: number }) => {
      clearNoticeTimeout(channel);
      if (channel === "github") {
        setGithubNotice(notice);
      } else {
        setConvexNotice(notice);
      }

      if (notice && options?.clearAfterMs) {
        scheduleClearNotice(channel, options.clearAfterMs);
      }
    },
    [clearNoticeTimeout, scheduleClearNotice],
  );

  const clearSaveNotices = useCallback(() => {
    clearNoticeTimeout("github");
    clearNoticeTimeout("convex");
    setGithubNotice(null);
    setConvexNotice(null);
  }, [clearNoticeTimeout]);

  return {
    githubNotice,
    convexNotice,
    setGithubNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) =>
      updateNotice("github", notice, options),
    setConvexNotice: (notice: ChangeNotice | null, options?: { clearAfterMs?: number }) =>
      updateNotice("convex", notice, options),
    clearSaveNotices,
  };
}
