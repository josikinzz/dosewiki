import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("@server/next/routeLoaders.substances", () => ({
  loadSubstanceMetadataRoute: vi.fn(),
  loadSubstanceRoute: vi.fn(async () => ({ kind: "ok", pageProps: {}, publicRevision: null })),
}));

vi.mock("@server/next/staticParams", () => ({
  getStaticSubstanceParams: vi.fn(async () => []),
}));

// The article body is out of scope; render only the notice slot the route fills.
vi.mock("@/features/article/pages/SubstanceArticlePage", () => ({
  SubstanceArticlePage: ({ warningBannerNotice }: { warningBannerNotice?: ReactNode }) => (
    <aside data-testid="notice">{warningBannerNotice}</aside>
  ),
}));

vi.mock("@/i18n/client", () => ({
  UiLocaleProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { loadSubstanceRoute } from "@server/next/routeLoaders.substances";
import LocalizedSubstancePage from "./page";

describe("Russian substance article route", () => {
  it("renders the machine-translation notice in Russian, linking to the English article", async () => {
    render(await LocalizedSubstancePage({ params: Promise.resolve({ slug: "lsd" }) }));

    const notice = screen.getByTestId("notice");
    expect(notice.textContent).not.toMatch(/\p{Script=Han}/u);
    expect(notice.textContent).toMatch(/\p{Script=Cyrillic}/u);
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringMatching(/\/lsd$/));
  });

  it("renders the reviewed line in Russian on a fully reviewed article", async () => {
    vi.mocked(loadSubstanceRoute).mockResolvedValueOnce({
      kind: "ok",
      pageProps: {} as never,
      metadata: {} as never,
      canonicalRoute: { family: "substance", params: { slug: "lsd" } },
      review: { reviewed: 2, total: 2, latestApprovedAt: Date.UTC(2026, 8, 21) },
    });
    render(await LocalizedSubstancePage({ params: Promise.resolve({ slug: "lsd" }) }));

    const notice = screen.getByTestId("notice");
    expect(notice.textContent).toMatch(/^Проверено человеком · 21 сентября 2026/);
    expect(notice.textContent).not.toMatch(/автоматически/);
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringMatching(/\/lsd$/));
  });
});
