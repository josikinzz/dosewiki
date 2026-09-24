import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UiTranslationRow } from "@lib/translation/uiTranslationTypes";
import { UiTranslationWorkbench } from "./UiTranslationWorkbench";

const row = (id: string, source: string, compiledTarget: string, pendingRefresh: UiTranslationRow["pendingRefresh"] = null): UiTranslationRow => ({
  id, source, context: `Context for ${id}`, locations: ["src/features/replications"], glossaryTerms: [], revision: 0, draft: null, approved: null, updatedAt: null, compiledTarget, status: "unreviewed", pendingRefresh,
});
const rows = [
  row("gallery.back", "Back to replications", "返回复现", { term: "Replication", expectedTarget: "体验再现" }),
  row("legacy.tutorials", "Tutorials and resources for replicating specific subjective effects, preserved from the Effect Index archive.", "用于复现特定主观效应的教程和资源，保存自 Effect Index 存档。", { term: null, expectedTarget: null }),
  row("appearance.light", "Light", "浅色"),
];

afterEach(() => vi.unstubAllGlobals());

async function openFilter(catalogRefreshed: boolean) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, locale: "zh-Hans", locales: ["zh-Hans"], rows, catalogRefreshed })));
  const user = userEvent.setup();
  render(<UiTranslationWorkbench locale="zh-Hans" />);
  await user.click(await screen.findByRole("button", { name: "Waiting for glossary refresh (2)" }));
  return user;
}

describe("waiting for glossary refresh", () => {
  it("lists each waiting row with its current wording, term, and approved rendering", async () => {
    await openFilter(false);
    const list = screen.getByRole("table", { name: "Waiting for glossary refresh" });
    const back = within(list).getByRole("row", { name: /Back to replications/ });
    expect(within(back).getByText("返回复现")).toBeInTheDocument();
    expect(within(back).getByText("Replication")).toBeInTheDocument();
    expect(within(back).getByText("体验再现")).toBeInTheDocument();
    // A record compiled before terms were recorded still lists the row.
    expect(within(list).getByRole("row", { name: /Tutorials and resources/ })).toHaveTextContent("Not recorded");
    expect(within(list).queryByText("Light")).not.toBeInTheDocument();
    expect(screen.getByText(/last catalog compile ran offline/i)).toBeInTheDocument();
  });

  it("opens a waiting row in the one-at-a-time view for a human override", async () => {
    const user = await openFilter(true);
    expect(screen.queryByText(/last catalog compile ran offline/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review Back to replications" }));
    expect(screen.getByRole("button", { name: "One at a time" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Translation for gallery.back" })).toHaveValue("返回复现");
    expect(screen.queryByRole("textbox", { name: "Translation for appearance.light" })).not.toBeInTheDocument();
  });
});
