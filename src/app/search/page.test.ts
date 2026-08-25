import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { PUBLIC_SITE } from "@server/next/publicSite";
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

    expect(metadata.title).toBe(`Search Results for "lsd" - ${SITE_FLAVOR_CONFIG.titleSuffix}`);
    expect(metadata.description).toBe(
      `Search ${SITE_FLAVOR_CONFIG.name} for substances, effects, reports, and profiles matching lsd.`,
    );
    // `generateMetadata` is a Next entry point with no injection seam, so the canonical
    // origin is asserted against the ambient flavor's own site identity.
    expect(metadata.alternates?.canonical).toBe(`${PUBLIC_SITE.url}/search`);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
