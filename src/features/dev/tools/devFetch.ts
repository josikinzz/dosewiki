/**
 * The one JSON request helper for dev tools. It turns every way a request can
 * fail into an `Error` whose message an editor can read:
 *
 * - the network is down: `messages.network`;
 * - the route refuses: the route's own `error` string, else `messages.failure`
 *   (or whatever `onError` builds from the status and payload);
 * - the route succeeds with a body that is not a JSON object: an unreadable
 *   response error, unless the caller opts into `emptyBodyOk`.
 *
 * It returns the payload as a plain record. Each caller still validates the
 * fields it needs and throws its own malformed-response error when they are
 * missing, so a broken contract never reads as an empty result.
 */

export type DevFetchPayload = Record<string, unknown>;

export interface DevFetchMessages {
  network: string;
  failure: string;
  /** A 2xx whose body is not a JSON object. */
  unreadable?: string;
}

export interface DevFetchOptions extends RequestInit {
  messages: DevFetchMessages;
  /**
   * Builds the error for a refused request, for routes whose status carries
   * meaning (a conflict, a gone record). `message` is the route's `error`
   * string or `messages.failure`. Return undefined for the plain error.
   */
  onError?: (status: number, payload: DevFetchPayload, message: string) => Error | undefined;
  /**
   * A 2xx with an empty or non-object body resolves to `{}` instead of
   * throwing. Only for routes whose success carries nothing the caller reads.
   */
  emptyBodyOk?: boolean;
}

export const UNREADABLE_RESPONSE = "The server returned an unreadable response. Try again.";

function asRecord(value: unknown): DevFetchPayload | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as DevFetchPayload)
    : null;
}

export async function devFetch(url: string, options: DevFetchOptions): Promise<DevFetchPayload> {
  const { messages, onError, emptyBodyOk = false, ...init } = options;
  let response: Response;
  try {
    response = Object.keys(init).length > 0 ? await fetch(url, init) : await fetch(url);
  } catch {
    throw new Error(messages.network);
  }

  const record = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const payload = record ?? {};
    const message = typeof payload.error === "string" ? payload.error : messages.failure;
    throw onError?.(response.status, payload, message) ?? new Error(message);
  }
  if (!record) {
    if (emptyBodyOk) {
      return {};
    }
    throw new Error(messages.unreadable ?? UNREADABLE_RESPONSE);
  }
  return record;
}

/** A JSON POST through `devFetch`. */
export function devPost(
  url: string,
  body: unknown,
  options: Omit<DevFetchOptions, "method" | "body">,
): Promise<DevFetchPayload> {
  return devFetch(url, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string> | undefined) },
    body: JSON.stringify(body),
  });
}
