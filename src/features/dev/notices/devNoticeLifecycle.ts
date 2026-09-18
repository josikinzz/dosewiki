import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

export type DevNoticeStatus = "pending" | "success" | "error";
type DevNoticeSeverity = "info" | "success" | "warning" | "danger"

export type DevNoticeChannel = string;
export type DevNoticeOperationId = string | number;

export type DevNotice = {
  channel: DevNoticeChannel;
  status: DevNoticeStatus;
  severity: DevNoticeSeverity;
  message: string;
  operationId?: DevNoticeOperationId;
  event?: string;
  debug?: Record<string, unknown>;
  sticky: boolean;
  autoClearMs: number | null;
  actionHref?: string;
  actionLabel?: string;
};

export type DevNoticeRenderProps = {
  variant: "default" | "success" | "destructive";
  icon: string;
  title: string;
  spin: boolean;
  ariaLive: "polite" | "assertive";
};

export type DevNoticePublishInput = {
  status: DevNoticeStatus;
  message: string;
  channel?: DevNoticeChannel;
  severity?: DevNoticeSeverity;
  operationId?: DevNoticeOperationId;
  event?: string;
  debug?: Record<string, unknown>;
  sticky?: boolean;
  autoClearMs?: number | null;
  actionHref?: string;
  actionLabel?: string;
};

export type DevNoticeEvent =
  | { type: "publish"; notice: DevNoticePublishInput }
  | {
      type: "complete";
      operationId: DevNoticeOperationId;
      status: Exclude<DevNoticeStatus, "pending">;
      message: string;
      channel?: DevNoticeChannel;
      severity?: DevNoticeSeverity;
      event?: string;
      debug?: Record<string, unknown>;
      sticky?: boolean;
      autoClearMs?: number | null;
      actionHref?: string;
      actionLabel?: string;
    }
  | { type: "clear"; channel?: DevNoticeChannel; operationId?: DevNoticeOperationId }
  | { type: "autoClear"; channel: DevNoticeChannel; operationId?: DevNoticeOperationId };

export type DevNoticeState = Record<DevNoticeChannel, DevNotice | null>;

const DEFAULT_DEV_NOTICE_CHANNEL = "default"

const getSeverity = (status: DevNoticeStatus, severity?: DevNoticeSeverity): DevNoticeSeverity => {
  if (severity) {
    return severity;
  }
  if (status === "error") {
    return "danger";
  }
  if (status === "success") {
    return "success";
  }
  return "info";
};

const getSticky = (status: DevNoticeStatus, sticky?: boolean, autoClearMs?: number | null) => {
  if (sticky !== undefined) {
    return sticky;
  }
  return status === "error" && autoClearMs == null;
};

const createDevNotice = (input: DevNoticePublishInput): DevNotice => {
  const channel = input.channel ?? DEFAULT_DEV_NOTICE_CHANNEL;
  const autoClearMs = input.autoClearMs ?? null;

  return {
    channel,
    status: input.status,
    severity: getSeverity(input.status, input.severity),
    message: input.message,
    operationId: input.operationId,
    event: input.event,
    debug: input.debug,
    sticky: getSticky(input.status, input.sticky, autoClearMs),
    autoClearMs,
    actionHref: input.actionHref,
    actionLabel: input.actionLabel,
  };
}

const matchesClearTarget = (
  notice: DevNotice | null | undefined,
  operationId?: DevNoticeOperationId,
) => {
  if (!notice) {
    return false;
  }
  return operationId === undefined || notice.operationId === operationId;
};

export const devNoticeReducer = (
  state: DevNoticeState,
  event: DevNoticeEvent,
): DevNoticeState => {
  switch (event.type) {
    case "publish": {
      const notice = createDevNotice(event.notice);
      return {
        ...state,
        [notice.channel]: notice,
      };
    }
    case "complete": {
      const channel = event.channel ?? DEFAULT_DEV_NOTICE_CHANNEL;
      const current = state[channel];
      if (current?.operationId !== event.operationId) {
        return state;
      }
      const notice = createDevNotice({
        channel,
        status: event.status,
        message: event.message,
        severity: event.severity,
        operationId: event.operationId,
        event: event.event,
        debug: event.debug,
        sticky: event.sticky,
        autoClearMs: event.autoClearMs,
        actionHref: event.actionHref,
        actionLabel: event.actionLabel,
      });
      return {
        ...state,
        [channel]: notice,
      };
    }
    case "clear": {
      if (event.channel) {
        if (!matchesClearTarget(state[event.channel], event.operationId)) {
          return state;
        }
        return {
          ...state,
          [event.channel]: null,
        };
      }

      let changed = false;
      const next: DevNoticeState = {};
      Object.entries(state).forEach(([channel, notice]) => {
        if (matchesClearTarget(notice, event.operationId)) {
          next[channel] = null;
          changed = true;
        } else {
          next[channel] = notice;
        }
      });
      return changed ? next : state;
    }
    case "autoClear": {
      const current = state[event.channel];
      if (!matchesClearTarget(current, event.operationId) || current?.sticky) {
        return state;
      }
      return {
        ...state,
        [event.channel]: null,
      };
    }
    default:
      return state;
  }
};

export const getDevNoticeRenderProps = (
  notice: Pick<DevNotice, "status" | "severity">,
  titleOverrides?: Partial<Record<DevNoticeStatus, string>>,
): DevNoticeRenderProps => {
  if (notice.status === "pending") {
    return {
      variant: "default",
      icon: "lucide:loader-circle",
      title: titleOverrides?.pending ?? "Working...",
      spin: true,
      ariaLive: "polite",
    };
  }

  if (notice.severity === "danger" || notice.status === "error") {
    return {
      variant: "destructive",
      icon: "lucide:triangle-alert",
      title: titleOverrides?.error ?? "Action failed",
      spin: false,
      ariaLive: "assertive",
    };
  }

  return {
    variant: "success",
    icon: "lucide:badge-check",
    title: titleOverrides?.success ?? "Status",
    spin: false,
    ariaLive: "polite",
  };
};

function useDevNoticeChannels(initialState: DevNoticeState = {}) { const [notices, dispatch] = useReducer(devNoticeReducer, initialState);
const timeoutRefs = useRef<Record<DevNoticeChannel, number | null>>({});
const timeoutKeys = useRef<Record<DevNoticeChannel, string | null>>({});

const clearTimer = useCallback((channel: DevNoticeChannel) => {
  const timeoutId = timeoutRefs.current[channel];
  if (timeoutId !== null && timeoutId !== undefined && typeof window !== "undefined") {
    window.clearTimeout(timeoutId);
  }
  timeoutRefs.current[channel] = null;
  timeoutKeys.current[channel] = null;
}, []);

useEffect(() => {
  Object.entries(notices).forEach(([channel, notice]) => {
    if (!notice) {
      clearTimer(channel);
      return;
    }
    const timerKey = `${notice.operationId ?? ""}:${notice.status}:${notice.message}:${notice.autoClearMs ?? ""}`;
    if (timeoutKeys.current[notice.channel] === timerKey) {
      return;
    }
    clearTimer(notice.channel);
    if (notice.autoClearMs != null && notice.autoClearMs > 0 && typeof window !== "undefined") {
      timeoutKeys.current[notice.channel] = timerKey;
      timeoutRefs.current[notice.channel] = window.setTimeout(() => {
        dispatch({
          type: "autoClear",
          channel: notice.channel,
          operationId: notice.operationId,
        });
        timeoutRefs.current[notice.channel] = null;
        timeoutKeys.current[notice.channel] = null;
      }, notice.autoClearMs);
    }
  });
}, [clearTimer, notices]);

useEffect(
  () => () => {
    Object.keys(timeoutRefs.current).forEach(clearTimer);
  },
  [clearTimer],
);

const publish = useCallback((notice: DevNoticePublishInput) => {
  dispatch({ type: "publish", notice });
}, []);

const complete = useCallback((event: Extract<DevNoticeEvent, { type: "complete" }>) => {
  dispatch(event);
}, []);

const clear = useCallback((channel?: DevNoticeChannel, operationId?: DevNoticeOperationId) => {
  if (channel) {
    clearTimer(channel);
  } else {
    Object.keys(timeoutRefs.current).forEach(clearTimer);
  }
  dispatch({ type: "clear", channel, operationId });
}, [clearTimer]);

return useMemo(
  () => ({
    notices,
    publish,
    complete,
    clear,
  }),
  [clear, complete, notices, publish],
); }

export function useDevNoticeChannel(channel: DevNoticeChannel = DEFAULT_DEV_NOTICE_CHANNEL) {
  const { notices, publish, complete, clear } = useDevNoticeChannels({ [channel]: null });
  const notice = notices[channel] ?? null;

  return useMemo(
    () => ({
      notice,
      publish: (next: Omit<DevNoticePublishInput, "channel"> & { channel?: DevNoticeChannel }) =>
        publish({ ...next, channel: next.channel ?? channel }),
      complete: (next: Omit<Extract<DevNoticeEvent, { type: "complete" }>, "type" | "channel"> & { channel?: DevNoticeChannel }) =>
        complete({ ...next, type: "complete", channel: next.channel ?? channel }),
      clear: (operationId?: DevNoticeOperationId) => clear(channel, operationId),
    }),
    [channel, clear, complete, notice, publish],
  );
}
