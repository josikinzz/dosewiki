import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChineseMessagesProvider from "@/i18n/ChineseMessagesProvider";
import { UiLocaleProvider } from "@/i18n/client";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => [],
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: () => null,
}));

const reportClientError = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/reportClientError", () => ({ reportClientError }));

const failure = { active: true };

function Fragile({ label = "Artwork" }: { label?: string }) {
  if (failure.active) throw new Error("stage exploded");
  return <p>{label}</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    failure.active = true;
    reportClientError.mockClear();
    // React logs caught render errors itself; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders its children while nothing throws", () => {
    failure.active = false;
    render(
      <ErrorBoundary name="test-region">
        <Fragile />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Artwork")).toBeInTheDocument();
  });

  it("fails only its own region and leaves siblings usable", async () => {
    const onSiblingClick = vi.fn();
    render(
      <>
        <button type="button" onClick={onSiblingClick}>
          Next artist
        </button>
        <ErrorBoundary name="test-region">
          <Fragile />
        </ErrorBoundary>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("This part of the page could not load");
    await userEvent.click(screen.getByRole("button", { name: "Next artist" }));
    expect(onSiblingClick).toHaveBeenCalledTimes(1);
  });

  it("reports each caught error once, with the boundary name", () => {
    render(
      <ErrorBoundary name="test-region">
        <Fragile />
      </ErrorBoundary>,
    );

    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "stage exploded" }),
      expect.objectContaining({ boundary: "test-region" }),
    );
  });

  it("retries the region when the reader asks to", async () => {
    render(
      <ErrorBoundary name="test-region">
        <Fragile />
      </ErrorBoundary>,
    );

    failure.active = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Artwork")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("resets when a reset key changes, and reports a new failure again", () => {
    const { rerender } = render(
      <ErrorBoundary name="test-region" resetKeys={["work-1"]}>
        <Fragile label="Work one" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    failure.active = false;
    rerender(
      <ErrorBoundary name="test-region" resetKeys={["work-2"]}>
        <Fragile label="Work two" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Work two")).toBeInTheDocument();

    failure.active = true;
    rerender(
      <ErrorBoundary name="test-region" resetKeys={["work-3"]}>
        <Fragile label="Work three" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledTimes(2);
  });

  it("renders a caller fallback with the error and a reset", async () => {
    render(
      <ErrorBoundary
        name="test-region"
        fallback={({ error, reset }) => (
          <button type="button" onClick={reset}>
            {error instanceof Error ? error.message : "unknown"}
          </button>
        )}
      >
        <Fragile />
      </ErrorBoundary>,
    );

    failure.active = false;
    await userEvent.click(screen.getByRole("button", { name: "stage exploded" }));
    expect(screen.getByText("Artwork")).toBeInTheDocument();
  });

  it("speaks Chinese on a zh route", () => {
    render(
      <UiLocaleProvider locale="zh-Hans">
        <ChineseMessagesProvider>
          <ErrorBoundary name="test-region">
            <Fragile />
          </ErrorBoundary>
        </ChineseMessagesProvider>
      </UiLocaleProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("页面的这一部分无法加载");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
