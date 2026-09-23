import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalErrorDocument as GlobalError } from "./GlobalErrorDocument";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegments: () => null,
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: () => null,
}));


describe("GlobalErrorDocument", () => {
  afterEach(() => {
    navigation.pathname = "/";
    vi.restoreAllMocks();
  });

  it("reports the root failure once and offers a retry in English", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("root layout exploded");

    render(<GlobalError error={error} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    const reports = log.mock.calls.filter(([message]) => String(message).startsWith("[global]"));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.[1]).toBe(error);
  });

  it("speaks Chinese when the root layout fails on a zh route", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    navigation.pathname = "/zh/lsd";

    render(<GlobalError error={new Error("root layout exploded")} reset={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "出现了问题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "zh-Hans");
  });
});
