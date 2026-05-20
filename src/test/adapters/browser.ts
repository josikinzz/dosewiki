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

export function installMatchMediaMock(matches = false): MockInstance<(query: string) => MediaQueryList> {
  const originalMatchMedia = window.matchMedia;
  const matchMediaMock = vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as MockInstance<(query: string) => MediaQueryList>;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMediaMock,
  });

  restoreCallbacks.push(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  return matchMediaMock;
}

export function resetBrowserAdapters(): void {
  while (restoreCallbacks.length > 0) {
    restoreCallbacks.pop()?.();
  }
}
