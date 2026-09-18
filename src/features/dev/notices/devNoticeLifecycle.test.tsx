import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  devNoticeReducer,
  getDevNoticeRenderProps,
  useDevNoticeChannel,
  type DevNoticeState,
} from "./devNoticeLifecycle";

describe("devNoticeReducer", () => {
  it("publishes pending notices and completes matching operations", () => {
    const pending = devNoticeReducer({}, {
      type: "publish",
      notice: {
        channel: "save.data",
        status: "pending",
        message: "Committing to production...",
        operationId: "save-1",
      },
    });

    expect(pending["save.data"]).toMatchObject({
      status: "pending",
      message: "Committing to production...",
      operationId: "save-1",
      sticky: false,
    });

    const completed = devNoticeReducer(pending, {
      type: "complete",
      channel: "save.data",
      operationId: "save-1",
      status: "success",
      message: "Saved articles to Postgres.",
      autoClearMs: 5000,
    });

    expect(completed["save.data"]).toMatchObject({
      status: "success",
      message: "Saved articles to Postgres.",
      autoClearMs: 5000,
      sticky: false,
    });
  });

  it("suppresses stale operation completions", () => {
    const state = devNoticeReducer({}, {
      type: "publish",
      notice: {
        channel: "generation.summary",
        status: "pending",
        message: "Generating summary...",
        operationId: "new-run",
      },
    });

    const next = devNoticeReducer(state, {
      type: "complete",
      channel: "generation.summary",
      operationId: "old-run",
      status: "success",
      message: "Generated old summary.",
    });

    expect(next).toBe(state);
    expect(next["generation.summary"]?.message).toBe("Generating summary...");
  });

  it("keeps sticky errors when auto-clear fires", () => {
    const state = devNoticeReducer({}, {
      type: "publish",
      notice: {
        channel: "profile",
        status: "error",
        message: "Postgres rejected the profile",
      },
    });

    const next = devNoticeReducer(state, {
      type: "autoClear",
      channel: "profile",
    });

    expect(next).toBe(state);
    expect(next.profile?.sticky).toBe(true);
  });

  it("auto-clears non-sticky success notices", () => {
    const state: DevNoticeState = devNoticeReducer({}, {
      type: "publish",
      notice: {
        channel: "indexLayout",
        status: "success",
        message: "Psychoactive layout updated",
        autoClearMs: 3000,
      },
    });

    const next = devNoticeReducer(state, {
      type: "autoClear",
      channel: "indexLayout",
    });

    expect(next.indexLayout).toBeNull();
  });

  it("maps render props by status and severity", () => {
    expect(getDevNoticeRenderProps({ status: "pending", severity: "info" })).toMatchObject({
      variant: "default",
      spin: true,
      ariaLive: "polite",
    });
    expect(getDevNoticeRenderProps({ status: "error", severity: "danger" })).toMatchObject({
      variant: "destructive",
      spin: false,
      ariaLive: "assertive",
    });
  });
});

describe("useDevNoticeChannel", () => {
  it("auto-clears success notices after their configured delay", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useDevNoticeChannel("save.github"));

    act(() => {
      result.current.publish({
        status: "success",
        message: "Committed changes to GitHub.",
        autoClearMs: 5000,
      });
    });

    expect(result.current.notice?.message).toBe("Committed changes to GitHub.");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.notice).toBeNull();
    unmount();
    vi.useRealTimers();
  });
});

