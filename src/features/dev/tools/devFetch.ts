export type DevFetchPayload = Record<string, unknown>;

export interface DevFetchMessages {
  network: string;
  failure: string;
  unreadable?: string;
}

export interface DevFetchOptions extends RequestInit {
  messages: DevFetchMessages;
  onError?: (status: number, payload: DevFetchPayload, message: string) => Error | undefined;
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
    const message = typeof payload.error === "string" && payload.error.trim() ? payload.error : messages.failure;
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
