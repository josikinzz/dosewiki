import { act, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchManifest } from "@/data/builders/searchManifest";
import type { UiLocale } from "@/i18n/messages";
import {
  loadSearchManifestIndex,
  resetSearchManifestForTests,
  useSearchManifestIndex,
} from "./useSearchManifest";

const MANIFEST: SearchManifest = {
  locale: "en",
  version: "hydration-test",
  shape: 2,
  entries: [
    { id: "substance:lsd", type: "substance", label: "LSD", slug: "lsd" },
  ],
};

function ManifestProbe() {
  const index = useSearchManifestIndex(true);
  return <div>{index ? index.query("lsd")[0]?.label : "No matches found"}</div>;
}

let root: Root | null = null;

beforeEach(() => {
  resetSearchManifestForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(MANIFEST), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.unstubAllGlobals();
  resetSearchManifestForTests();
});


describe("useSearchManifestIndex intent loading", () => {
  it("does not fetch until search is enabled", async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSearchManifestIndex(enabled),
      { initialProps: { enabled: false } },
    );

    expect(fetch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("allows an explicit retry after a failed shared load", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(MANIFEST), { status: 200 }));

    expect(await loadSearchManifestIndex()).toBeNull();
    const recovered = await loadSearchManifestIndex();

    expect(recovered?.query("lsd")[0]?.label).toBe("LSD");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
describe("useSearchManifestIndex hydration", () => {
  it("hydrates an empty server snapshot after the manifest warms without a mismatch", async () => {
    const markup = renderToString(<ManifestProbe />);
    expect(markup).toContain("No matches found");

    await loadSearchManifestIndex();

    const container = document.createElement("div");
    container.innerHTML = markup;
    const recoverableErrors: unknown[] = [];

    await act(async () => {
      root = hydrateRoot(container, <ManifestProbe />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
    });

    await waitFor(() => expect(container.textContent).toBe("LSD"));
    expect(recoverableErrors).toEqual([]);
  });

  it("keeps the previous locale's warmed index out of a newly requested locale", async () => {
    await loadSearchManifestIndex("en");
    let resolveManifest!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveManifest = resolve; }),
    );
    const { result, rerender, unmount } = renderHook(
      ({ locale }: { locale: UiLocale }) => useSearchManifestIndex(true, locale),
      { initialProps: { locale: "en" as UiLocale } },
    );
    expect(result.current?.query("lsd")[0]?.label).toBe("LSD");

    rerender({ locale: "zh-Hans" });
    expect(result.current).toBeNull();

    await act(async () => {
      resolveManifest(new Response(JSON.stringify({
        ...MANIFEST,
        locale: "zh-Hans",
        entries: [{ ...MANIFEST.entries[0], label: "Localized LSD", aliases: ["lsd"] }],
      })));
    });
    await waitFor(() => expect(result.current?.query("lsd")[0]?.label).toBe("Localized LSD"));

    rerender({ locale: "en" });
    expect(result.current?.query("lsd")[0]?.label).toBe("LSD");
    unmount();
  });

  it("does not expose a manifest returned for the wrong locale", async () => {
    expect(await loadSearchManifestIndex("zh-Hans")).toBeNull();
    const english = await loadSearchManifestIndex("en");
    expect(english?.query("lsd")[0]?.label).toBe("LSD");
  });
});
