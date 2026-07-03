import { describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

vi.mock("@/components/pages/LiveSearchResultsPage", () => ({
  LiveSearchResultsPage: () => null,
}));

describe("search page metadata", () => {
  it("keeps search result URLs out of the index", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ q: "lsd" }),
    });

    expect(metadata.title).toBe("Search · lsd");
    expect(metadata.description).toBe(
      "Search dose.wiki for substances, effects, reports, and profiles matching lsd.",
    );
    expect(metadata.alternates?.canonical).toBe("https://dosewiki-admin.vercel.app/search");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
