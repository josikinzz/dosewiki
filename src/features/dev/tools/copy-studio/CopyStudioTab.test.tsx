import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  useQuery: () => [],
}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: { copyBlocks: { getAll: "copyBlocks.getAll" } },
}));

vi.mock("@/components/pages/PublicMarkdownBody", () => ({
  PublicMarkdownBody: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}));

import { CopyStudioTab } from "./CopyStudioTab";

function railKeys(): string[] {
  return within(screen.getByRole("group", { name: "Copy blocks" }))
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

describe("CopyStudioTab", () => {
  it("filters the rail by key and label substring across every group", async () => {
    render(<CopyStudioTab />);

    const search = screen.getByRole("searchbox", { name: "Search" });
    await userEvent.type(search, "about-");

    const keys = railKeys();
    expect(keys).toHaveLength(6);
    expect(keys.every((entry) => entry.includes("about-"))).toBe(true);
    expect(keys.some((entry) => entry.startsWith("Reuse notice"))).toBe(true);
    expect(keys.some((entry) => entry.includes("SEO"))).toBe(true);
    expect(screen.getByText("6 found")).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.type(search, "footer tagline");
    expect(railKeys().every((entry) => entry.startsWith("Footer tagline"))).toBe(true);

    await userEvent.clear(search);
    await userEvent.type(search, "zzz-no-such-block");
    expect(screen.getByText("No block key or label matches that.")).toBeTruthy();
  });

  it("opens on the deep-linked block and its group", () => {
    render(<CopyStudioTab initialKey="about-doc-link-blurbs" />);

    const groupTabs = screen.getByRole("tablist", { name: "Copy groups" });
    expect(within(groupTabs).getByRole("tab", { name: /About/ }).getAttribute("aria-selected")).toBe("true");

    const active = within(screen.getByRole("group", { name: "Copy blocks" }))
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "true");
    expect(active?.textContent).toContain("about-doc-link-blurbs");
  });
});
