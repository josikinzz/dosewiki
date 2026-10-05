import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import { UnsavedWorkProvider } from "../../components/unsavedWork";
import {
  expectRailMarksUnsaved,
  renderInDevShell,
  switchTabExpectingGuard,
} from "../../pages/devShellTestHarness";
import { GlossaryTab } from "./GlossaryTab";
import type { GlossaryList, GlossaryRow } from "./glossaryModel";

const NO_JOBS = { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 };

function row(locale: string, term: string): GlossaryRow {
  return { locale, term, target: `${term}-${locale}`, kind: "effect-name", status: "draft", source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1, revision: "1:0", approved_target: null, review_provenance: "unreviewed" };
}

/** Two languages, one draft term each, and an approved style guide with one rule. */
function stubWorkbenchApi() {
  const glossaryLocales: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://dev.dose.wiki");
      if (url.pathname === "/api/dev/translation-glossary") {
        const locale = url.searchParams.get("locale") ?? "de";
        glossaryLocales.push(locale);
        const list: GlossaryList = {
          ok: true,
          generatedAt: 1,
          locale,
          promptVersion: "v1",
          segments: { total: 10, current: 10 },
          jobs: NO_JOBS,
          locales: [
            { locale: "de", live: true, draft: 1, approved: 0 },
            { locale: "fr", live: false, draft: 1, approved: 0 },
          ],
          rows: [row(locale, "anxiety")],
          pending: [],
          glosses: {},
        };
        return Response.json(list);
      }
      if (url.pathname === "/api/dev/translation-style-guide") {
        const guide = { rules: ["Use the informal du."], examples: [] };
        return Response.json({ locale: url.searchParams.get("locale"), revision: 1, draft: null, approved: guide, approvedRevision: "1", history: [] });
      }
      return Response.json({ ok: true, items: [], total: 0, offset: 0, pageSize: 50, checked: [], counts: {}, reason: null, pages: [], affectedPagesTotal: 0 });
    }),
  );
  return { glossaryLocales };
}

async function dirtyStyleGuide(user: ReturnType<typeof userEvent.setup>) {
  const rules = await screen.findByRole("textbox", { name: "Rules, one per line" });
  await user.type(rules, "\nKeep units in English.");
  await screen.findByText("Unsaved changes");
}

describe("GlossaryTab reports unsaved work to the shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("asks before a language switch drops an unsaved style guide, and switches only after Discard", async () => {
    window.history.replaceState({}, "", "/dev/glossary?locale=de&translationView=words&translationWords=style");
    const { glossaryLocales } = stubWorkbenchApi();
    const user = userEvent.setup();
    renderInDevShell(<GlossaryTab viewerRole="translator" />, { tab: "glossary" });
    await dirtyStyleGuide(user);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "fr");

    const dialog = screen.getByRole("dialog", { name: /discard/i });
    expect(within(dialog).getByText(/^Glossary: style guide for .*German/)).toBeTruthy();
    expect(glossaryLocales).toEqual(["de"]);
    expect(screen.getByRole("combobox", { name: "Language", hidden: true })).toHaveValue("de");

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(glossaryLocales).toEqual(["de", "fr"]));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("fr"));
  });

  it("keeps the language and the typed guide on Keep editing", async () => {
    window.history.replaceState({}, "", "/dev/glossary?locale=de&translationView=words&translationWords=style");
    const { glossaryLocales } = stubWorkbenchApi();
    const user = userEvent.setup();
    renderInDevShell(<GlossaryTab viewerRole="translator" />, { tab: "glossary" });
    await dirtyStyleGuide(user);

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "fr");
    fireEvent.click(within(screen.getByRole("dialog", { name: /discard/i })).getByRole("button", { name: "Keep editing" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /discard/i })).toBeNull());
    expect(glossaryLocales).toEqual(["de"]);
    expect(screen.getByRole("textbox", { name: "Rules, one per line" })).toHaveValue("Use the informal du.\nKeep units in English.");
  });

  it("marks the rail for unsaved term wording and asks before a rail click drops it", async () => {
    window.history.replaceState({}, "", "/dev/glossary?locale=de&translationView=words&translationCategory=effects&translationStatus=draft");
    stubWorkbenchApi();
    const user = userEvent.setup();
    const { nav, onTabChange } = renderInDevShell(<GlossaryTab viewerRole="translator" />, { tab: "glossary" });
    await user.type(await screen.findByRole("textbox", { name: "Translation for anxiety" }), " edited");

    expectRailMarksUnsaved(nav, "Glossary");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText(/^Glossary: term wording in .*German/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
  });

  it("leaves unload to the shell: no listener of its own, and the shell holds the tab while a guide is unsaved", async () => {
    window.history.replaceState({}, "", "/dev/glossary?locale=de&translationView=words&translationWords=style");
    stubWorkbenchApi();
    const add = vi.spyOn(window, "addEventListener");
    const user = userEvent.setup();
    render(<UnsavedWorkProvider><GlossaryTab viewerRole="translator" /></UnsavedWorkProvider>);
    const clean = new Event("beforeunload", { cancelable: true });
    await screen.findByRole("textbox", { name: "Rules, one per line" });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await dirtyStyleGuide(user);
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    // One listener, the shell's.
    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
  });
});
