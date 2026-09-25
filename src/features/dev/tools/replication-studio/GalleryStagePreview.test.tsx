import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

vi.mock("@/hooks/useEditorRead", () => ({ useEditorRead: () => null }));

import { clearArticlePreviewCache } from "@/features/dev/components/ArticlePreviewFrame";
import { GalleryStagePreview } from "./GalleryStagePreview";
import type { GalleryMatch } from "./substanceGalleryPortalModel";

// The first render of the whole article layout is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

function match(slug: string): GalleryMatch {
  return {
    replication: {
      id: `id-${slug}`,
      slug,
      title: `Work ${slug}`,
      artist: "Chelsea Morgan",
      type: "image",
      effect_slug: "drifting",
      effect_name: "Drifting",
      effect_tags: [],
      credit_line: null,
      rights_status: null,
      url: `https://cdn.example/${slug}.png`,
      thumbnail_url: null,
      format: "png",
    },
    provenance: {
      matchedVia: "specific_drug",
      effectSlug: "drifting",
      effectName: "Drifting",
      substanceSlug: "lsd",
    },
  };
}

const LSD = (() => {
  const base = createEmptyArticle();
  return {
    ...base,
    slug: "lsd",
    title: "LSD",
    // The showcase closes Subjective Effects, which renders only with content.
    subjective_effects: {
      ...base.subjective_effects,
      notes: { ...base.subjective_effects.notes, overview: "Visual drifting is common." },
    },
  } as unknown as SubstanceArticle;
})();

beforeEach(() => {
  clearArticlePreviewCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/dev/editor-library" && url.searchParams.get("slug") === "lsd") {
        return new Response(JSON.stringify({ ok: true, scope: "article", article: LSD }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GalleryStagePreview", () => {
  it("is one open disclosure whose copy counts automatic placements as published", async () => {
    const user = userEvent.setup();
    render(<GalleryStagePreview matches={[]} />);

    const toggles = screen.getAllByRole("button", { expanded: true });
    expect(toggles).toHaveLength(1);
    expect(toggles[0]).toHaveTextContent("Hide preview");
    // The article draws automatic placements too, so the copy never says it
    // shows curated works only.
    expect(screen.getByText(/automatic placements and curation together/i)).toBeInTheDocument();
    expect(screen.queryByText(/curated works and nothing else/i)).not.toBeInTheDocument();
    expect(screen.getByText(/as soon as an automatic placement or a curated work/i)).toBeInTheDocument();

    await user.click(toggles[0]);
    expect(screen.getByRole("button", { name: "Show preview" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/No image or video is placed/i)).not.toBeInTheDocument();
  });

  it("shows the board's showcase inside the real article, in the frame's own document", async () => {
    const user = userEvent.setup();
    render(<GalleryStagePreview matches={[match("one"), match("two")]} substanceSlug="lsd" />);

    await user.click(screen.getByRole("button", { name: "In the article" }));

    const frame = screen.getByTitle(/Showcase preview/) as HTMLIFrameElement;
    const body = within(frame.contentDocument!.body);
    await body.findByRole("heading", { level: 1, name: "LSD" });
    const showcase = frame.contentDocument!.querySelector("[data-preview-focus]");
    expect(showcase).not.toBeNull();
    expect(showcase?.closest("#subjective-effects, section")).not.toBeNull();
    expect(showcase?.textContent).toContain("Work one");
  });
});
