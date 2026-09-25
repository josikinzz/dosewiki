import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

const { readSpy } = vi.hoisted(() => ({ readSpy: vi.fn(() => null) }));
vi.mock("@/hooks/useEditorRead", () => ({ useEditorRead: readSpy }));

import { clearArticlePreviewCache } from "@/features/dev/components/ArticlePreviewFrame";
import { MoleculeArticlePreview } from "./MoleculeArticlePreview";

// The first render of the whole article layout is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const LSD = { ...createEmptyArticle(), slug: "lsd", title: "LSD" } as unknown as SubstanceArticle;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>draft-depiction</text></svg>';

beforeEach(() => {
  clearArticlePreviewCache();
  readSpy.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      return url.pathname === "/api/dev/editor-library"
        ? new Response(JSON.stringify({ ok: true, scope: "article", article: LSD }), { status: 200 })
        : new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MoleculeArticlePreview", () => {
  it("mounts nothing until asked, then shows the unsaved depiction in the article hero", async () => {
    render(<MoleculeArticlePreview slug="lsd" svg={SVG} />);
    expect(screen.queryByTitle(/Molecule preview/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview in the article" }));

    const frame = screen.getByTitle(/Molecule preview/) as HTMLIFrameElement;
    await within(frame.contentDocument!.body).findByRole("heading", { level: 1, name: "LSD" });
    const sources = Array.from(frame.contentDocument!.querySelectorAll("img")).map(
      (image) => decodeURIComponent(image.getAttribute("src") ?? ""),
    );
    expect(sources.some((source) => source.includes("draft-depiction"))).toBe(true);
    // The draft stands in for the saved depiction, so the saved one is not read.
    expect(readSpy).toHaveBeenCalledWith("moleculeOverrides:getMetadataBySlug", "skip", "document");
  });
});
