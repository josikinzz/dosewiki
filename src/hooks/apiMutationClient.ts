type JsonRecord = Record<string, unknown>;

type JsonRequestOptions = {
  body: unknown;
  onNetworkError?: (error: unknown) => never;
  onResponse?: (response: Response, result: JsonRecord) => void;
  timeoutMs?: number;
};

export async function postJson(
  url: string,
  { body, onNetworkError, onResponse, timeoutMs }: JsonRequestOptions,
): Promise<{ response: Response; result: JsonRecord }> {
  let response: Response;
  const controller =
    typeof AbortController !== "undefined" && typeof timeoutMs === "number" && timeoutMs > 0
      ? new AbortController()
      : null;
  const timeoutId =
    controller && timeoutMs
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (error) {
    if (onNetworkError) {
      onNetworkError(error);
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }

  const result = (await response.json().catch(() => ({}))) as JsonRecord;
  onResponse?.(response, result);

  return { response, result };
}

export function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
