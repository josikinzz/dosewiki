import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportCardModel } from "@/types/tripReport";
import { projectReportBrowsePage } from "@server/next/reportBrowse";
import { TripReportsExplorer } from "./TripReportsExplorer";

vi.mock("server-only", () => ({}));
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/translation/localizedRecords", () => ({}));

function reportCard(index: number): ReportCardModel {
  const key = index.toString().padStart(2, "0");
  return { slug: `report-${key}`, title: `Report ${key}`, featured: false, subject: { name: `Author ${index % 3}` }, substances: [{ name: "DMT" }] };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  });
});
beforeEach(() => window.history.replaceState({}, "", "/reports"));
afterEach(() => vi.unstubAllGlobals());

function serveReports(reports: ReportCardModel[]) {
  const fetcher = vi.fn(async (input: string) => {
    const params = new URL(input, "https://dose.wiki").searchParams;
    return { ok: true, json: async () => projectReportBrowsePage(reports, { view: params.get("view") as "substance" | "author" | "title", query: params.get("q") ?? undefined, substance: params.get("substance"), sortId: params.get("sort") ?? undefined, cursor: params.get("cursor") }) };
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("TripReportsExplorer", () => {
  it("renders a routed grouping before fetching and keeps every page reachable", async () => {
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));
    const fetcher = serveReports(reports);
    render(<TripReportsExplorer initialView="author" browsingPage={projectReportBrowsePage(reports, { view: "author" })} />);
    expect(screen.getByRole("button", { name: "Group by: By author" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Author 1" })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Load more reports" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more reports" })).not.toBeInTheDocument());
    for (const toggle of screen.getAllByRole("button", { name: /^Expand Author/ })) {
      await userEvent.click(toggle);
    }
    const lists = screen.getAllByRole("list");
    const slugs = lists.flatMap((list) => within(list).queryAllByRole("link").map((link) => link.getAttribute("href"))).filter((href) => href?.startsWith("/reports/report-"));
    expect(new Set(slugs).size).toBe(30);
  });

  it("searches beyond the first page and restores complete discovery when cleared", async () => {
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));
    serveReports(reports);
    render(<TripReportsExplorer browsingPage={projectReportBrowsePage(reports, { view: "substance" })} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "Report 30");
    await waitFor(() => expect(screen.getByText("1 of 30 reports")).toBeInTheDocument());
    expect(window.location.search).toBe("?q=Report+30");
    await user.click(screen.getByRole("button", { name: "Expand DMT" }));
    expect(screen.getByRole("link", { name: /Report 30/i })).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Load more reports" })).toBeInTheDocument());
  });

  it("offers retry after a failed page without discarding the visible reports", async () => {
    const reports = Array.from({ length: 30 }, (_, index) => reportCard(index + 1));
    const fetcher = serveReports(reports);
    fetcher.mockRejectedValueOnce(new Error("offline"));
    render(<TripReportsExplorer browsingPage={projectReportBrowsePage(reports, { view: "substance" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Load more reports" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "DMT" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more reports" })).not.toBeInTheDocument());
  });
});
