import { act, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadSearchManifestIndex,
  resetSearchManifestForTests,
  useSearchManifestIndex,
} from "./useSearchManifest";

const MANIFEST = {
  version: "hydration-test",
  shape: 1,
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
});
