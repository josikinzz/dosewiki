type JsonRecord = Record<string, unknown>;

type JsonRequestOptions = {
  body: unknown;
  onNetworkError?: (error: unknown) => never;
  onResponse?: (response: Response, result: JsonRecord) => void;
};

export async function postJson(
  url: string,
  { body, onNetworkError, onResponse }: JsonRequestOptions,
): Promise<{ response: Response; result: JsonRecord }> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (onNetworkError) {
      onNetworkError(error);
    }
    throw error;
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
