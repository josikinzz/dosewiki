import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChineseMessagesProvider from "@/i18n/ChineseMessagesProvider";
import { UiLocaleProvider } from "@/i18n/client";
import { RouteErrorPage } from "./RouteErrorPage";

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => [],
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: () => null,
}));

describe("RouteErrorPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports each error once per occurrence, through StrictMode replays and re-renders", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reports = () =>
      log.mock.calls.filter(([message]) => String(message).startsWith("[replications]"));
    const first = new Error("route exploded");
    const { rerender } = render(
      <StrictMode>
        <RouteErrorPage error={first} reset={vi.fn()} boundary="replications" />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <RouteErrorPage error={first} reset={vi.fn()} boundary="replications" />
      </StrictMode>,
    );
    expect(reports()).toHaveLength(1);
    expect(reports()[0]?.[1]).toBe(first);

    const second = new Error("route exploded again");
    rerender(
      <StrictMode>
        <RouteErrorPage error={second} reset={vi.fn()} boundary="replications" />
      </StrictMode>,
    );
    expect(reports()).toHaveLength(2);
    expect(reports()[1]?.[1]).toBe(second);
  });

  it("offers a retry and a recovery link in English", async () => {
    const reset = vi.fn();
    render(
      <RouteErrorPage
        error={new Error("route exploded")}
        reset={reset}
        boundary="replications"
        recovery={{ href: "/replications", label: "Back to replications" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to replications" })).toHaveAttribute("href", "/replications");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders Chinese strings on a zh route", () => {
    render(
      <UiLocaleProvider locale="zh-Hans">
        <ChineseMessagesProvider>
          <RouteErrorPage error={new Error("route exploded")} reset={vi.fn()} boundary="root" />
        </ChineseMessagesProvider>
      </UiLocaleProvider>,
    );

    expect(screen.getByRole("heading", { name: "出现了问题" })).toBeInTheDocument();
    expect(screen.getByText("意外错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回物质列表" })).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });
});
