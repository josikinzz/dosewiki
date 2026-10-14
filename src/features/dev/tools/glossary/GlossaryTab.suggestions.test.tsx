import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlossaryTab } from "./GlossaryTab";
import type { GlossaryList, GlossaryRow } from "./glossaryModel";

const anxiety: GlossaryRow = { locale: "de", term: "anxiety", target: "Angst", kind: "effect-name", status: "draft", source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1, revision: "1:0", approved_target: null, review_provenance: "unreviewed" };
const list: GlossaryList = {
  ok: true, generatedAt: 1, locale: "de", promptVersion: "v1", segments: { total: 1, current: 1 },
  jobs: { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 },
  locales: [{ locale: "de", live: true, draft: 1, approved: 0 }], rows: [anxiety], pending: [], glosses: {},
};
/** One new suggestion a reader sent from the public glossary. */
const suggestion = { id: "fb-1", status: "new", details: "Reads more naturally", created_at: "2026-10-12T21:23:50.303Z", locale: "de", term: "anxiety", target: "Angst", version: "v1", alternative: "Beklemmung" };

describe("reader suggestions in the glossary workbench", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("opens from their link, counts them on the tab, and links each to its term", async () => {
    window.history.replaceState({}, "", "/dev/glossary?translationView=suggestions");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "https://dev.dose.wiki").pathname;
      if (path === "/api/dev/translation-glossary") return Response.json(list);
      if (path === "/api/glossary-feedback/queue") return Response.json({ ok: true, feedback: [suggestion] });
      return Response.json({ ok: true });
    }));
    render(<GlossaryTab viewerRole="translator" />);
    const tab = () => within(screen.getByRole("tablist", { name: "Workbench view" })).getByRole("tab", { name: /^Suggestions(,|$)/ });
    await waitFor(() => expect(tab()).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => expect(tab()).toHaveAccessibleName("Suggestions, 1 waiting"));
    const panel = screen.getByRole("tabpanel", { name: "Suggestions" });
    expect(await within(panel).findAllByText("Beklemmung")).not.toHaveLength(0);
    expect(within(panel).getByRole("link", { name: /Open anxiety in Terms/ })).toHaveAttribute("href", expect.stringContaining("translationTerm=anxiety"));
  });
});
