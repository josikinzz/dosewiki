import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlossaryTab } from "./GlossaryTab";
import type { GlossaryList, GlossaryRow } from "./glossaryModel";

const LOCALE = "de";
const NO_JOBS = { runId: null, requestedAt: null, total: 0, active: 0, completed: 0, completedWithRejections: 0, exhausted: 0 };

function row(term: string, status: GlossaryRow["status"], target = `${term}-de`): GlossaryRow {
  return { locale: LOCALE, term, target, kind: "effect-name", status, source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1, revision: "1:0", approved_target: status === "approved" ? target : null, review_provenance: status === "approved" ? "human_review" : "unreviewed" };
}

/** Approved before review tracking existed: live, and never checked by a person. */
function legacy(term: string, target = `${term}-de`): GlossaryRow {
  return { ...row(term, "approved", target), review_provenance: "legacy_unverified" };
}

type Call = { path: string; body: Record<string, unknown> | string };

/**
 * Serves the list from a mutable row set and applies approve and edit to it,
 * so the reload after a write shows the new status. `release` holds the next
 * write open until the test lets it through; `importResponse` is what the
 * import route answers; `glosses` is the definition map the list carries and
 * the gloss route writes to.
 */
function stubGlossaryApi(rows: GlossaryRow[], pending: string[] = [], importResponse: Response = Response.json({ ok: true, approved: 0, drafts: 3 }), glosses: Record<string, string> = {}) {
  const calls: Call[] = [];
  let release: (() => void) | null = null;
  const gate = () => new Promise<void>((resolve) => { release = resolve; });
  let hold = false;
  const refusals: Response[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "https://dev.dose.wiki").pathname;
      if (path === "/api/dev/translation-glossary") {
        const list: GlossaryList = {
          ok: true,
          generatedAt: 1,
          locale: LOCALE,
          promptVersion: "v1",
          segments: { total: 10, current: 10 },
          jobs: NO_JOBS,
          locales: [{ locale: LOCALE, live: true, draft: rows.filter((r) => r.status === "draft").length, approved: rows.filter((r) => r.status === "approved").length }],
          rows: rows.map((r) => ({ ...r })),
          pending,
          glosses: { ...glosses },
        };
        return Response.json(list);
      }
      if (path === "/api/dev/translation-style-guide" && !init) return Response.json({ locale: LOCALE, revision: 0, draft: null, approved: null, approvedRevision: "", history: [] });
      if (path === "/api/dev/translation-inbox") return Response.json({ ok: true, locale: LOCALE, items: [], total: 0, offset: 0, pageSize: 50, checked: [], counts: {}, reason: null });
      if (path.endsWith("/import")) {
        calls.push({ path, body: String(init?.body) });
        return refusals.shift() ?? importResponse.clone();
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ path, body });
      const refusal = refusals.shift();
      if (refusal) return refusal;
      if (hold) {
        hold = false;
        await gate();
      }
      if (path.endsWith("/approve")) {
        const terms = body.terms as string[];
        for (const r of rows) if (terms.includes(r.term)) r.status = "approved";
        return Response.json({ ok: true, approved: terms });
      }
      if (path.endsWith("/confirm")) {
        const terms = body.terms as string[];
        for (const r of rows) if (terms.includes(r.term)) r.review_provenance = "human_review";
        return Response.json({ ok: true, confirmed: terms });
      }
      if (path.endsWith("/edit")) {
        const target = rows.find((r) => r.term === body.term)!;
        target.target = String(body.target);
        target.status = "draft";
        target.revision = "1:1";
        return Response.json({ ok: true, row: target });
      }
      if (path.endsWith("/gloss")) {
        if (typeof body.gloss !== "string" || body.gloss.length > 40) return Response.json({ error: "A definition is one line of at most 240 characters." }, { status: 400 });
        glosses[String(body.term)] = body.gloss;
        return Response.json({ ok: true, row: { term: body.term, kind: "effect-name", gloss: body.gloss, updated_at: 2, updated_by: "editor@dose.wiki" } });
      }
      return Response.json({ ok: true });
    }),
  );
  return {
    calls,
    /** The next write blocks until `release()` is called. */
    holdNextWrite: () => { hold = true; },
    release: () => release?.(),
    refuseNextWrite: (terms = ["Artist", "Replicator"], collisionConfirmation = "a".repeat(64)) => {
      refusals.push(Response.json({
        error: "These terms share a rendering.",
        collisions: [{ kind: "replication", target: "Künstler", terms }],
        collisionConfirmation,
      }, { status: 409 }));
    },
  };
}

const rowFor = (term: string) => {
  const element = document.querySelector(`tr[data-term="${term}"]`);
  if (!(element instanceof HTMLTableRowElement)) throw new Error(`no row for ${term}`);
  return within(element);
};

const viewButton = (name: string) => within(screen.getByRole("group", { name: "Workbench view" })).getByRole("button", { name });

/** Import, export, and drafting sit in the Terms toolbar's More menu. */
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More" }));
  return within(await screen.findByRole("menu"));
}

describe("GlossaryTab", () => {
  // These cases review one open category of glossary terms, so they open it through its deep link.
  beforeEach(() => {
    window.history.replaceState({}, "", "/dev/glossary?translationView=words&translationCategory=effects&translationStatus=draft");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("retains unsaved wording after searching away and back", async () => {
    stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for anxiety" });
    await user.clear(input);
    await user.type(input, "my unsaved correction");
    const search = screen.getByRole("searchbox", { name: "Search words" });
    await user.type(search, "euphoria");
    expect(screen.queryByRole("textbox", { name: "Rendering for anxiety" })).not.toBeInTheDocument();
    await user.clear(search);
    expect(screen.getByRole("textbox", { name: "Rendering for anxiety" })).toHaveValue("my unsaved correction");
  });
  it("updates the URL when changing workbench views", async () => {
    stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByRole("textbox", { name: "Rendering for anxiety" });
    await user.click(viewButton("Inbox"));
    expect(new URLSearchParams(window.location.search).get("translationView")).toBe("inbox");
  });

  it("approves an unchanged unreviewed row explicitly, locks only that row, and hands focus to the next unreviewed row after the reload", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("anxiety");

    const first = screen.getByRole("textbox", { name: "Rendering for anxiety" });
    const second = screen.getByRole("textbox", { name: "Rendering for euphoria" });
    api.holdNextWrite();
    first.focus();
    await user.click(rowFor("anxiety").getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0]).toEqual({ path: "/api/dev/translation-glossary/approve", body: { locale: LOCALE, terms: ["anxiety"], expectedRevisions: { anxiety: "1:0" }, reason: { kind: "terminology", note: "" } } });

    // Mid-write: the written row is held, the other row is fully live.
    expect(first).toHaveAttribute("readonly");
    expect(first).toHaveAttribute("aria-busy", "true");
    expect(rowFor("anxiety").getByRole("button", { name: "Approve" })).toHaveFocus();
    expect(rowFor("anxiety").getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(second).toBeEnabled();
    expect(second).not.toHaveAttribute("readonly");
    expect(rowFor("euphoria").getByRole("button", { name: "Approve" })).toBeEnabled();

    api.release();
    await screen.findByText('Approved "anxiety".');
    // The approved row leaves the Unreviewed list; the next unreviewed row takes focus.
    expect(document.querySelector('tr[data-term="anxiety"]')).toBeNull();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Rendering for euphoria" })).toHaveFocus());
    expect(rowFor("euphoria").getByText("Unreviewed")).toBeTruthy();
  });

  it("does not implicitly approve an unchanged rendering on Enter", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for anxiety" });
    input.focus();
    await user.keyboard("{Enter}");
    expect(api.calls).toHaveLength(0);
    expect(rowFor("anxiety").getByText("Unreviewed")).toBeInTheDocument();
  });

  it("labels legacy approvals as live and never checked, apart from drafts, and can save unchanged wording as a draft", async () => {
    const imported = legacy("anxiety");
    const api = stubGlossaryApi([imported, row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("euphoria");
    // The default drafts view no longer lists live wording.
    expect(document.querySelector('tr[data-term="anxiety"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: /Live, never checked/ }));
    await waitFor(() => expect(rowFor("anxiety").getByText("Live, never checked")).toBeInTheDocument());
    expect(document.querySelector('tr[data-term="euphoria"]')).toBeNull();
    expect(screen.queryByText(/All 2 terms.*reviewed/)).not.toBeInTheDocument();
    await user.click(rowFor("anxiety").getByRole("button", { name: "Save draft" }));
    await screen.findByText('Saved "anxiety" as anxiety-de; awaiting approval.');
    expect(api.calls[0].body).toMatchObject({ intent: "draft", expectedRevision: "1:0" });
    // Now a draft: it moves to the drafts view, where it is approved like any other.
    await user.click(screen.getByRole("button", { name: /Unreviewed/ }));
    await waitFor(() => expect(rowFor("anxiety").getByRole("button", { name: "Approve" })).toBeEnabled());
    expect(rowFor("anxiety").queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("confirms one live, never checked row at the revision shown", async () => {
    const api = stubGlossaryApi([legacy("anxiety"), legacy("euphoria")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByTestId("glossary-summary");
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("0 of 2 terms approved");
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("2 live, never checked");
    await user.click(screen.getByRole("button", { name: /Live, never checked/ }));
    await user.click(rowFor("anxiety").getByRole("button", { name: "Confirm" }));
    await screen.findByText('Confirmed "anxiety".');
    expect(api.calls).toEqual([{ path: "/api/dev/translation-glossary/confirm", body: { locale: LOCALE, terms: ["anxiety"], expectedRevisions: { anxiety: "1:0" }, reason: { kind: "terminology", note: "" } } }]);
    expect(document.querySelector('tr[data-term="anxiety"]')).toBeNull();
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("1 of 2 terms approved");
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("1 live, never checked");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Rendering for euphoria" })).toHaveFocus());
  });

  it("counts drafts and never-checked rows apart per category, and each bulk action touches exactly its own count", async () => {
    const api = stubGlossaryApi([
      row("anxiety", "draft"), row("calm", "draft"), row("euphoria", "draft"),
      legacy("focus"), legacy("joy"),
      row("sedation", "approved"),
    ]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("anxiety");
    await user.click(screen.getByRole("button", { name: "All" }));
    const group = within(await screen.findByTestId("glossary-group-effects"));
    expect(group.getByText(/3 drafts, 2 never checked/)).toBeInTheDocument();
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("1 of 6 terms approved");
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("3 unreviewed · 2 live, never checked");

    await user.click(group.getByRole("button", { name: /Approve all 3 unreviewed terms in/ }));
    const approveDialog = within(await screen.findByRole("dialog"));
    expect(approveDialog.getByText(/Approve the 3 unreviewed terms/)).toBeInTheDocument();
    await user.click(approveDialog.getByRole("button", { name: /^Approve / }));
    await screen.findByText("Approved 3 terms.");
    expect(api.calls[0]).toMatchObject({ path: "/api/dev/translation-glossary/approve", body: { terms: ["anxiety", "calm", "euphoria"] } });

    await user.click(within(screen.getByTestId("glossary-group-effects")).getByRole("button", { name: /Confirm all 2 live, never checked terms in/ }));
    const confirmDialog = within(await screen.findByRole("dialog"));
    expect(confirmDialog.getByText(/Confirm the 2 live, never checked terms/)).toBeInTheDocument();
    await user.click(confirmDialog.getByRole("button", { name: /^Confirm / }));
    await screen.findByText("Confirmed 2 terms.");
    expect(api.calls[1]).toEqual({ path: "/api/dev/translation-glossary/confirm", body: { locale: LOCALE, terms: ["focus", "joy"], expectedRevisions: { focus: "1:0", joy: "1:0" }, reason: { kind: "terminology", note: "" } } });
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("Every term is reviewed");
    expect(screen.getByTestId("glossary-summary")).toHaveTextContent("6 terms approved");
  });

  it("confirms every never-checked row a search leaves in a category after naming the exact count", async () => {
    const api = stubGlossaryApi([legacy("anxiety"), legacy("euphoria"), legacy("focus", "Fokus-de")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByTestId("glossary-summary");
    await user.click(screen.getByRole("button", { name: /Live, never checked/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search words" }), "a");
    await user.click(await screen.findByRole("button", { name: "Confirm all 2 live, never checked terms in Subjective Effect Index" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Confirm the 2 live, never checked terms in Subjective Effect Index?")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
    await user.click(dialog.getByRole("button", { name: "Confirm Subjective Effect Index" }));
    await screen.findByText("Confirmed 2 terms.");
    expect(api.calls[0].body).toMatchObject({ terms: ["anxiety", "euphoria"] });
  });

  it("preserves typed glossary wording when switching workbench views", async () => {
    stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for anxiety" });
    await user.clear(input);
    await user.type(input, "Unsaved correction");
    await user.click(viewButton("Articles"));
    await user.click(viewButton("Terms"));
    expect(screen.getByRole("textbox", { name: "Rendering for anxiety" })).toHaveValue("Unsaved correction");
  });

  it("returns focus to the written row when no unreviewed row follows it", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "approved")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("anxiety");
    await user.click(screen.getByRole("button", { name: "All" }));
    await screen.findByText("euphoria");

    await user.click(rowFor("anxiety").getByRole("button", { name: "Approve" }));
    await screen.findByText('Approved "anxiety".');

    const written = screen.getByRole("textbox", { name: "Rendering for anxiety" });
    await waitFor(() => expect(written).toHaveFocus());
    expect(api.calls).toHaveLength(1);
    expect(rowFor("anxiety").getByText("Approved")).toBeTruthy();
    expect(rowFor("anxiety").queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("persists an edited rendering on Enter rather than approving the old rendering", async () => {
    stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    const { unmount } = render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("anxiety");

    const input = screen.getByRole("textbox", { name: "Rendering for anxiety" });
    await user.clear(input);
    await user.paste("Angst");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(rowFor("anxiety").getByText("Unreviewed")).toBeInTheDocument());

    unmount();
    render(<GlossaryTab viewerRole="admin" />);
    await user.click(await screen.findByRole("button", { name: "All" }));
    expect(await screen.findByRole("textbox", { name: "Rendering for anxiety" })).toHaveValue("Angst");
  });

  it("shows an admin the actions that call the model and hides them from a translator", async () => {
    stubGlossaryApi([row("anxiety", "approved")], ["anxiety"]);
    const user = userEvent.setup();
    const { unmount } = render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("Every term is reviewed");
    const adminMenu = await openMore(user);
    expect(adminMenu.getByRole("menuitem", { name: "Draft missing terms" })).toBeInTheDocument();
    expect(adminMenu.getByRole("menuitem", { name: "Export CSV" })).toHaveAttribute("href", "/api/dev/translation-glossary/export?locale=de");
    expect(adminMenu.getByRole("menuitem", { name: "Import CSV" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    // Run controls sit in the collapsed Runs panel inside Articles.
    expect(screen.queryByRole("button", { name: /^Retranslate/ })).toBeNull();
    await user.click(viewButton("Articles"));
    await user.click(screen.getByRole("button", { name: /^Runs/ }));
    expect(screen.getAllByRole("button", { name: /^Retranslate/ })).toHaveLength(1);
    unmount();
    window.history.replaceState({}, "", "/dev/glossary?translationView=words&translationCategory=effects");

    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("Every term is reviewed");
    expect(screen.queryByRole("button", { name: /^Retranslate/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /main translation/ })).toBeNull();
    const translatorMenu = await openMore(user);
    expect(translatorMenu.queryByRole("menuitem", { name: "Draft missing terms" })).toBeNull();
    expect(translatorMenu.getByRole("menuitem", { name: "Export CSV" })).toBeInTheDocument();
    expect(translatorMenu.getByRole("menuitem", { name: "Import CSV" })).toBeInTheDocument();
  });

  it("hides Start main translation from a translator once the review is complete", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ok: true, generatedAt: 1, locale: LOCALE, promptVersion: "v1", segments: { total: 0, current: 0 }, jobs: NO_JOBS,
      locales: [{ locale: LOCALE, live: true, draft: 0, approved: 1 }], rows: [row("anxiety", "approved")], pending: [], glosses: {},
    } satisfies GlossaryList)));
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("Every term is reviewed");
    expect(screen.queryByRole("button", { name: "Start main translation" })).toBeNull();
  });

  it("sends the chosen file to the import route and reports the counts, then reloads", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("anxiety");

    const csv = "term,target,status\nanxiety,Angst,approved\n";
    await user.upload(screen.getByLabelText("Choose a glossary CSV"), new File([csv], "glossary-de.csv", { type: "text/csv" }));

    await screen.findByText("Imported 3 drafts; each requires explicit approval.");
    expect(api.calls).toEqual([{ path: "/api/dev/translation-glossary/import", body: csv }]);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]).toBe("/api/dev/translation-glossary?locale=de&includeUsage=0");
  });

  it("shows the server's refusal when the import is rejected", async () => {
    stubGlossaryApi([row("anxiety", "draft")], [], Response.json({ error: "Nothing was imported. This term is not in the glossary or on the site: Serotonin.", unknownTerms: ["Serotonin"] }, { status: 400 }));
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("anxiety");

    await user.upload(screen.getByLabelText("Choose a glossary CSV"), new File(["term,target\nSerotonin,x\n"], "g.csv", { type: "text/csv" }));

    await screen.findByText("Nothing was imported. This term is not in the glossary or on the site: Serotonin.");
    expect(screen.getByLabelText("Choose a glossary CSV")).toBeEnabled();
  });

  it("lets an editor rewrite a definition in place with Enter and shows the new text without a reload", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")], [], undefined, { euphoria: "Intense well-being" });
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="editor" />);
    await screen.findByText("anxiety");
    expect(screen.getByText("Click a definition to edit it.")).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    const listCalls = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Edit definition for anxiety" }));
    const input = screen.getByRole("textbox", { name: "Definition for anxiety" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    await user.type(input, "Unease without a cause{Enter}");

    await screen.findByText('Saved the definition of "anxiety".');
    expect(api.calls).toEqual([{ path: "/api/dev/translation-glossary/gloss", body: { term: "anxiety", gloss: "Unease without a cause" } }]);
    expect(fetchMock.mock.calls).toHaveLength(listCalls + 1);
    expect(screen.queryByRole("textbox", { name: "Definition for anxiety" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit definition for anxiety" })).toHaveTextContent("Unease without a cause");
    expect(screen.getByRole("button", { name: "Edit definition for euphoria" })).toHaveTextContent("Intense well-being");
    // The rendering review is untouched by a definition save.
    expect(rowFor("anxiety").getByText("Unreviewed")).toBeTruthy();
  });

  it("locks the written row while a definition saves and reports the pill as such", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="editor" />);
    await screen.findByText("anxiety");

    api.holdNextWrite();
    await user.click(screen.getByRole("button", { name: "Edit definition for anxiety" }));
    await user.type(screen.getByRole("textbox", { name: "Definition for anxiety" }), "Unease without a cause{Enter}");

    await screen.findByText("Saving definition");
    expect(rowFor("anxiety").getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(rowFor("anxiety").getByRole("button", { name: "Edit definition for anxiety" })).toBeDisabled();
    expect(rowFor("euphoria").getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(rowFor("euphoria").getByRole("button", { name: "Edit definition for euphoria" })).toBeEnabled();

    api.release();
    await screen.findByText('Saved the definition of "anxiety".');
    expect(screen.queryByText("Saving definition")).toBeNull();
    expect(rowFor("anxiety").getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("cancels a definition edit on Escape or blur and skips the write when nothing changed", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft")], [], undefined, { anxiety: "Unease without a cause" });
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("anxiety");

    await user.click(screen.getByRole("button", { name: "Edit definition for anxiety" }));
    await user.type(screen.getByRole("textbox", { name: "Definition for anxiety" }), " changed{Escape}");
    expect(screen.queryByRole("textbox", { name: "Definition for anxiety" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit definition for anxiety" })).toHaveTextContent("Unease without a cause");

    await user.click(screen.getByRole("button", { name: "Edit definition for anxiety" }));
    await user.type(screen.getByRole("textbox", { name: "Definition for anxiety" }), " changed");
    await user.click(screen.getByRole("textbox", { name: "Rendering for anxiety" }));
    expect(screen.queryByRole("textbox", { name: "Definition for anxiety" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit definition for anxiety" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox", { name: "Definition for anxiety" })).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("surfaces the server's refusal of a definition and keeps the old text", async () => {
    stubGlossaryApi([row("anxiety", "draft")], [], undefined, { anxiety: "Unease without a cause" });
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="editor" />);
    await screen.findByText("anxiety");

    await user.click(screen.getByRole("button", { name: "Edit definition for anxiety" }));
    await user.type(screen.getByRole("textbox", { name: "Definition for anxiety" }), " and a great deal more than one line allows{Enter}");

    await screen.findByText("A definition is one line of at most 240 characters.");
    expect(screen.getByRole("button", { name: "Edit definition for anxiety" })).toHaveTextContent("Unease without a cause");
  });

  it("shows a translator the definitions as plain text with no edit control and nothing where none exists", async () => {
    stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")], [], undefined, { euphoria: "Intense well-being" });
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("anxiety");

    expect(rowFor("euphoria").getByText("Intense well-being")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit definition/ })).toBeNull();
    expect(screen.queryByText("No definition yet")).toBeNull();
    expect(screen.queryByText(/Click a definition/)).toBeNull();

    // An editor sees the placeholder where a definition is missing.
    render(<GlossaryTab viewerRole="editor" />);
    await screen.findByRole("button", { name: "Edit definition for anxiety" });
    expect(screen.getByRole("button", { name: "Edit definition for anxiety" })).toHaveTextContent("No definition yet");
  });

  it("saving a changed rendering leaves it unreviewed and approval uses the saved revision", async () => {
    const api = stubGlossaryApi([row("Artist", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for Artist" });
    await user.clear(input);
    await user.type(input, "Künstler");
    await user.click(rowFor("Artist").getByRole("button", { name: "Save draft" }));
    await screen.findByText('Saved "Artist" as Künstler; awaiting approval.');
    expect(api.calls[0].body).toEqual({ locale: LOCALE, term: "Artist", target: "Künstler", intent: "draft", expectedRevision: "1:0" });
    expect(rowFor("Artist").getByText("Unreviewed")).toBeInTheDocument();
    await user.click(rowFor("Artist").getByRole("button", { name: "Approve" }));
    await screen.findByText('Approved "Artist".');
    expect(api.calls[1].body).toEqual({ locale: LOCALE, reason: { kind: "terminology", note: "" }, terms: ["Artist"], expectedRevisions: { Artist: "1:1" } });
  });

  it("asks again for changed collisions during individual approval and hands focus forward only after success", async () => {
    const api = stubGlossaryApi([row("Artist", "draft", "Künstler"), row("Next", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for Artist" });
    api.refuseNextWrite();
    api.refuseNextWrite(["Artist", "Creator", "Replicator"], "b".repeat(64));
    await user.click(rowFor("Artist").getByRole("button", { name: "Approve" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText("Artist, Creator, Replicator");
    expect(api.calls).toHaveLength(2);
    expect(input).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText('Approved "Artist".');
    expect(api.calls[2].body).toEqual({ locale: LOCALE, reason: { kind: "terminology", note: "" }, terms: ["Artist"], expectedRevisions: { Artist: "1:0" }, collisionConfirmation: "b".repeat(64) });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Rendering for Next" })).toHaveFocus());
  });

  it("preserves the full bulk selection through the shared-rendering confirmation", async () => {
    const api = stubGlossaryApi([row("Artist", "draft", "Künstler"), row("Replicator", "draft", "Künstler")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("Artist");
    api.refuseNextWrite();
    await user.click(screen.getByRole("button", { name: /^Approve all 2 unreviewed terms in/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Approve / }));
    await screen.findByRole("button", { name: "Allow shared rendering" });
    expect(api.calls).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText("Approved 2 terms.");
    expect(api.calls[1].body).toEqual({ locale: LOCALE, reason: { kind: "terminology", note: "" }, terms: ["Artist", "Replicator"], expectedRevisions: { Artist: "1:0", Replicator: "1:0" }, collisionConfirmation: "a".repeat(64) });
  });

  it("retries the same CSV with a bounded acknowledgement header only after explicit confirmation", async () => {
    const api = stubGlossaryApi([row("Artist", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("Artist");
    const csv = "term,target,status\nArtist,Künstler,approved\n";
    const file = new File([csv], "glossary.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => csv });
    api.refuseNextWrite();
    await user.upload(screen.getByLabelText("Choose a glossary CSV"), file);
    await screen.findByRole("dialog");
    expect(api.calls).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText("Imported 3 drafts; each requires explicit approval.");
    expect(api.calls.map((call) => call.body)).toEqual([csv, csv]);
    const requests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/import?"));
    expect(new Headers(requests[0][1]?.headers).has("X-Glossary-Collision-Confirmation")).toBe(false);
    expect(new Headers(requests[1][1]?.headers).get("X-Glossary-Collision-Confirmation")).toBe("a".repeat(64));
  });
});

describe("workbench views", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("opens on category choices without fetching the review inbox or usage corpus", async () => {
    stubGlossaryApi([row("anxiety", "draft")]);
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByTestId("glossary-summary");
    const views = within(screen.getByRole("group", { name: "Workbench view" })).getAllByRole("button");
    expect(views.map((button) => button.textContent)).toEqual(["Terms", "Interface text", "Articles", "Inbox", "Style guide"]);
    expect(viewButton("Terms")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Subjective Effect Index:/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Rendering for anxiety" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Review inbox" })).toBeNull();
    const requests = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(requests.some((url) => url.includes("translation-inbox"))).toBe(false);
    expect(requests.some((url) => url.includes("includeUsage=0"))).toBe(true);
  });

  it("continues with the first category that has work left and focuses its first row needing review", async () => {
    stubGlossaryApi([{ ...row("Replication", "approved"), kind: "replication" }, row("anxiety", "approved"), row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const summary = within(await screen.findByTestId("glossary-summary"));
    expect(summary.getByText("Next: Subjective Effect Index, 1 left")).toBeInTheDocument();
    await user.click(summary.getByRole("button", { name: "Continue reviewing" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Rendering for euphoria" })).toHaveFocus());
    expect(screen.getByRole("button", { name: /^Subjective Effect Index:/ })).toHaveAttribute("aria-expanded", "true");
    expect(new URLSearchParams(window.location.search).get("translationCategory")).toBe("effects");
  });

  it("opens one category at a time and retains unsaved wording between categories", async () => {
    stubGlossaryApi([row("anxiety", "draft"), { ...row("Replication", "draft"), kind: "replication" }]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await user.click(await screen.findByRole("button", { name: /^Subjective Effect Index:/ }));
    const input = screen.getByRole("textbox", { name: "Rendering for anxiety" });
    await user.clear(input);
    await user.type(input, "Keep this correction");
    await user.click(screen.getByRole("button", { name: /^Replications:/ }));
    expect(screen.queryByRole("textbox", { name: "Rendering for anxiety" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Rendering for Replication" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /^Subjective Effect Index:/ }));
    expect(screen.getByRole("textbox", { name: "Rendering for anxiety" })).toHaveValue("Keep this correction");
    expect(screen.queryByRole("textbox", { name: "Rendering for Replication" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("translationCategory")).toBe("effects");
  });

  it("shows one status legend with the deployment line", async () => {
    stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByTestId("glossary-summary");
    await user.click(screen.getByRole("button", { name: "Status legend" }));
    expect(screen.getAllByText("Approved here is not yet deployed; Coverage in Articles shows what has been released.")).toHaveLength(1);
    const legend = within(screen.getByRole("list", { name: "Status legend" }));
    for (const state of ["Machine", "Draft", "Live, never checked", "Human approved", "Source changed", "Re-check"]) expect(legend.getByText(state)).toBeInTheDocument();
  });

  type Expectation = { view: "Inbox" | "Terms" | "Interface text" | "Style guide" | "Articles"; region: string; search?: string };
  const cases: [string, Expectation][] = [
    ["translationView=inbox", { view: "Inbox", region: "Review inbox" }],
    ["translationView=glossary&translationTerm=anxiety", { view: "Terms", region: "Glossary terms", search: "anxiety" }],
    ["translationView=labels&translationLabel=appearance.light", { view: "Interface text", region: "UI labels", search: "appearance.light" }],
    ["translationView=coverage", { view: "Articles", region: "Translation coverage" }],
    ["translationView=changes", { view: "Articles", region: "Translation changes" }],
    ["translationView=narrative", { view: "Articles", region: "Narrative review" }],
    ["translationReview=article&translationLocale=de&translationSlug=sample&translationSegment=x", { view: "Articles", region: "Narrative review" }],
    ["translationReview=article&translationLocale=de&translationSlug=sample&translationNote=summary", { view: "Articles", region: "Narrative review" }],
    ["translationView=words&translationTerm=anxiety", { view: "Terms", region: "Glossary terms", search: "anxiety" }],
    ["translationView=words&translationLabel=appearance.light", { view: "Interface text", region: "UI labels", search: "appearance.light" }],
    ["translationView=pages", { view: "Articles", region: "Narrative review" }],
    ["translationView=words&translationWords=style", { view: "Style guide", region: "Style guide" }],
    ["translationView=words&translationWords=labels", { view: "Interface text", region: "UI labels" }],
  ];

  it.each(cases)("a deep link with %s opens the matching view", async (query, expected) => {
    window.history.replaceState({}, "", `/dev/glossary?${query}`);
    stubGlossaryApi([row("anxiety", "draft")]);
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByTestId("glossary-summary");
    expect(viewButton(expected.view)).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("region", { name: expected.region })).toBeVisible();
    if (expected.search) expect(screen.getByRole("searchbox", { name: "Search words" })).toHaveValue(expected.search);
  });

  it("filters glossary terms and UI labels with one search", async () => {
    window.history.replaceState({}, "", "/dev/glossary?translationView=words&translationCategory=effects&translationStatus=draft");
    stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("euphoria");
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    await user.type(screen.getByRole("searchbox", { name: "Search words" }), "anx");
    await waitFor(() => expect(screen.queryByText("euphoria")).toBeNull());
    await user.click(viewButton("Interface text"));
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getByRole("searchbox", { name: "Search words" })).toHaveValue("anx");
  });

  it("shows a Translator without admin no run controls in Articles", async () => {
    window.history.replaceState({}, "", "/dev/glossary?translationView=pages");
    stubGlossaryApi([row("anxiety", "approved")], ["anxiety"]);
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByTestId("glossary-summary");
    expect(screen.getByRole("region", { name: "Narrative review" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Runs/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Retranslate/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /main translation/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Retry/ })).toBeNull();
  });

  it("keeps an admin's run controls collapsed inside Articles until opened", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ok: true, generatedAt: 1, locale: LOCALE, promptVersion: "v1", segments: { total: 0, current: 0 }, jobs: NO_JOBS,
      locales: [{ locale: LOCALE, live: true, draft: 0, approved: 1 }], rows: [row("anxiety", "approved")], pending: [], glosses: {},
    } satisfies GlossaryList)));
    window.history.replaceState({}, "", "/dev/glossary?translationView=pages");
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByTestId("glossary-summary");
    const runs = screen.getByRole("button", { name: /^Runs/ });
    expect(runs).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Start main translation" })).toBeNull();
    await user.click(runs);
    expect(screen.getByRole("button", { name: "Start main translation" })).toBeVisible();
  });
});
