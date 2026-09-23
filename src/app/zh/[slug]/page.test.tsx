import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageReviewState } from "@server/translation/pageReview";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

const route = vi.hoisted(() => ({ review: undefined as PageReviewState | undefined }));

vi.mock("@server/next/routeLoaders.substances", () => ({
  loadSubstanceMetadataRoute: vi.fn(),
  loadSubstanceRoute: vi.fn(async () => ({ kind: "ok", pageProps: {}, publicRevision: null, review: route.review })),
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

import LocalizedSubstancePage from "./page";

async function renderNotice(review: PageReviewState | undefined) {
  route.review = review;
  render(await LocalizedSubstancePage({ params: Promise.resolve({ slug: "2-benzylpiperidine" }) }));
  return screen.getByTestId("notice").textContent ?? "";
}

describe("Simplified Chinese substance article route", () => {
  beforeEach(() => {
    route.review = undefined;
  });

  it("shows the reviewed line with the date on a fully reviewed article, keeping the English link", async () => {
    const text = await renderNotice({ reviewed: 4, total: 4, latestApprovedAt: Date.UTC(2026, 8, 21) });
    expect(text).toContain("人工审校 · 2026年9月21日");
    expect(text).not.toContain("机器翻译");
    expect(screen.getByRole("link", { name: "英文原文" })).toHaveAttribute("href", expect.stringMatching(/\/2-benzylpiperidine$/));
  });

  it("keeps the notice and shows the count on a partly reviewed article", async () => {
    const text = await renderNotice({ reviewed: 3, total: 4, latestApprovedAt: Date.UTC(2026, 8, 21) });
    expect(text).toContain("本页由机器翻译");
    expect(text).toContain("共 4 段，已人工审校 3 段。");
    expect(screen.getByRole("link", { name: "英文原文" })).toHaveAttribute("href", expect.stringMatching(/\/2-benzylpiperidine$/));
  });

  it("shows the plain notice on an unreviewed article", async () => {
    const text = await renderNotice({ reviewed: 0, total: 4, latestApprovedAt: null });
    expect(text).toBe("本页由机器翻译，以英文原文为准。尚未翻译的段落保留英文。");
  });
});
