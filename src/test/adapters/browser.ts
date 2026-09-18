import { vi, type MockInstance } from "vitest";

const restoreCallbacks: Array<() => void> = [];

interface JsonFetchOptions {
  ok?: boolean;
  status?: number;
  headers?: HeadersInit;
}

export function mockFetchJson<T>(
  payload: T,
  options: JsonFetchOptions = {},
): MockInstance<typeof globalThis.fetch> {
  const status = options.status ?? (options.ok === false ? 500 : 200);
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => (
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
    })
  ));

  restoreCallbacks.push(() => fetchMock.mockRestore());

  return fetchMock;
}

export function resetBrowserAdapters(): void {
  while (restoreCallbacks.length > 0) {
    restoreCallbacks.pop()?.();
  }
}
