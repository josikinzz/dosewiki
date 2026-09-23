import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranslationProgress } from "./TranslationProgress";
import type { GlossaryList } from "./glossaryModel";

const fixture = (jobs: Partial<GlossaryList["jobs"]> = {}) => ({ locale: "ru", generatedAt: 1, jobs: {
  total: 100, completed: 40, active: 60, completedWithRejections: 5, exhausted: 0,
  inFlight: 10, retrying: 2, runId: "saved-run", requestedAt: 1, ...jobs,
} }) as GlossaryList;

describe("durable language progress", () => {
  it("distinguishes processed pages from fully translated pages", () => {
    render(<TranslationProgress data={fixture()} starting={false} error={null} onRefresh={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("40 of 100 processed")).toBeVisible();
    expect(screen.getByText("60")).toBeVisible();
    expect(screen.getByText("35")).toBeVisible();
    expect(screen.getByText(/10 pages being worked on/)).toBeVisible();
    expect(screen.getByText(/^Updated /)).toBeVisible();
    expect(screen.getByText(/5 pages contain segments that failed validation/)).toBeVisible();
  });
  it("shows a saved completion immediately on reopening a finished run", () => {
    render(<TranslationProgress data={fixture({ completed: 100, active: 0, completedWithRejections: 0 })} starting={false} error={null} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Latest run complete" })).toBeVisible();
    expect(screen.getByText(/This run is saved/)).toBeVisible();
  });
  it("never celebrates failures as a clean completion", () => {
    render(<TranslationProgress data={fixture({ completed: 90, active: 0, exhausted: 10 })} starting={false} error={null} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Translation finished with items to review" })).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
  it("offers a retry of stopped pages only once the run has settled and a handler is given", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<TranslationProgress data={fixture({ completed: 90, active: 0, exhausted: 10 })} starting={false} error={null} onRefresh={vi.fn()} onRetryExhausted={onRetry} />);
    screen.getByRole("button", { name: "Retry 10 failed pages" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<TranslationProgress data={fixture({ completed: 90, active: 0, exhausted: 10 })} starting={false} error={null} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /failed page/ })).toBeNull();
    rerender(<TranslationProgress data={fixture({ exhausted: 10 })} starting={false} error={null} onRefresh={vi.fn()} onRetryExhausted={onRetry} />);
    expect(screen.queryByRole("button", { name: /failed page/ })).toBeNull();
  });
  it("keeps progress visible during refresh failures", () => {
    render(<TranslationProgress data={fixture()} starting={false} error="Connection unavailable" onRefresh={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Showing the last saved counts");
    expect(screen.getByRole("button", { name: "Retry refresh" })).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });

  it("labels the saved run scope instead of implying whole-site coverage", () => {
    render(<TranslationProgress data={fixture({ total: 2, completed: 2, active: 0, completedWithRejections: 0 })} starting={false} error={null} onRefresh={vi.fn()} />);
    expect(screen.getByText("2 of 2 processed")).toBeVisible();
    expect(screen.getByText(/This is the latest saved run, not whole-site coverage/)).toBeVisible();
  });
});
