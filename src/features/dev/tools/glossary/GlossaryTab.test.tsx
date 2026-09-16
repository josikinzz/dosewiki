import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlossaryTab } from "./GlossaryTab";
import type { GlossaryList, GlossaryRow } from "./glossaryModel";

const LOCALE = "de";

function row(term: string, status: GlossaryRow["status"], target = `${term}-de`): GlossaryRow {
  return { locale: LOCALE, term, target, kind: "effect-name", status, source: "model", reviewed_at: null, reviewed_by: null, retranslated_at: null, updated_at: 1 };
}

type Call = { path: string; body: Record<string, unknown> | string };

/**
 * Serves the list from a mutable row set and applies approve and edit to it,
 * so the reload after a write shows the new status. `release` holds the next
 * write open until the test lets it through; `importResponse` is what the
 * import route answers; `glosses` is the definition map the list carries and
 * the gloss route writes to.
 */
function stubGlossaryApi(rows: GlossaryRow[], pending: string[] = [], importResponse: Response = Response.json({ ok: true, approved: 2, drafts: 1 }), glosses: Record<string, string> = {}) {
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
          locale: LOCALE,
          promptVersion: "v1",
          segments: { total: 10, current: 10 },
          locales: [{ locale: LOCALE, live: true, draft: rows.filter((r) => r.status === "draft").length, approved: rows.filter((r) => r.status === "approved").length }],
          rows: rows.map((r) => ({ ...r })),
          pending,
          glosses: { ...glosses },
        };
        return Response.json(list);
      }
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
      if (path.endsWith("/edit")) {
        const target = rows.find((r) => r.term === body.term)!;
        target.target = String(body.target);
        target.status = "approved";
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

describe("GlossaryTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("approves an unchanged unreviewed row on Enter, locks only that row, and hands focus to the next unreviewed row after the reload", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("anxiety");

    const first = screen.getByRole("textbox", { name: "Rendering for anxiety" });
    const second = screen.getByRole("textbox", { name: "Rendering for euphoria" });
    api.holdNextWrite();
    first.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0]).toEqual({ path: "/api/dev/translation-glossary/approve", body: { locale: LOCALE, terms: ["anxiety"] } });

    // Mid-write: the written row is held, the other row is fully live.
    expect(first).toHaveAttribute("readonly");
    expect(first).toHaveAttribute("aria-busy", "true");
    expect(first).toHaveFocus();
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

  it("returns focus to the written row when no unreviewed row follows it", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "approved")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("anxiety");
    await user.click(screen.getByRole("button", { name: "All" }));
    await screen.findByText("euphoria");

    screen.getByRole("textbox", { name: "Rendering for anxiety" }).focus();
    await user.keyboard("{Enter}");
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
    await waitFor(() => expect(rowFor("anxiety").getByText("Approved")).toBeInTheDocument());

    unmount();
    render(<GlossaryTab viewerRole="admin" />);
    await user.click(await screen.findByRole("button", { name: "All" }));
    expect(await screen.findByRole("textbox", { name: "Rendering for anxiety" })).toHaveValue("Angst");
  });

  it("shows an admin the actions that call the model and hides them from a translator", async () => {
    stubGlossaryApi([row("anxiety", "approved")], ["anxiety"]);
    const { unmount } = render(<GlossaryTab viewerRole="admin" />);
    await screen.findByText("All 1 term for de are reviewed");
    expect(screen.getByRole("button", { name: "Draft missing terms" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Retranslate/ })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/dev/translation-glossary/export?locale=de");
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
    unmount();

    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("All 1 term for de are reviewed");
    expect(screen.queryByRole("button", { name: "Draft missing terms" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Retranslate/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /main translation/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Export CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
  });

  it("hides Start main translation from a translator once the review is complete", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ok: true, locale: LOCALE, promptVersion: "v1", segments: { total: 0, current: 0 },
      locales: [{ locale: LOCALE, live: true, draft: 0, approved: 1 }], rows: [row("anxiety", "approved")], pending: [], glosses: {},
    } satisfies GlossaryList)));
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("All 1 term for de are reviewed");
    expect(screen.queryByRole("button", { name: "Start main translation" })).toBeNull();
  });

  it("sends the chosen file to the import route and reports the counts, then reloads", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("anxiety");

    const csv = "term,target,status\nanxiety,Angst,approved\n";
    await user.upload(screen.getByLabelText("Choose a glossary CSV"), new File([csv], "glossary-de.csv", { type: "text/csv" }));

    await screen.findByText("Imported 2 approved and 1 unreviewed renderings.");
    expect(api.calls).toEqual([{ path: "/api/dev/translation-glossary/import", body: csv }]);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]).toBe("/api/dev/translation-glossary?locale=de");
  });

  it("shows the server's refusal when the import is rejected", async () => {
    stubGlossaryApi([row("anxiety", "draft")], [], Response.json({ error: "Nothing was imported. This term is not in the glossary or on the site: Serotonin.", unknownTerms: ["Serotonin"] }, { status: 400 }));
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("anxiety");

    await user.upload(screen.getByLabelText("Choose a glossary CSV"), new File(["term,target\nSerotonin,x\n"], "g.csv", { type: "text/csv" }));

    await screen.findByText("Nothing was imported. This term is not in the glossary or on the site: Serotonin.");
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeEnabled();
  });

  it("lets an editor rewrite a definition in place with Enter and shows the new text without a reload", async () => {
    const api = stubGlossaryApi([row("anxiety", "draft"), row("euphoria", "draft")], [], undefined, { euphoria: "Intense well-being" });
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="editor" />);
    await screen.findByText("anxiety");
    expect(screen.getByText("Definitions tell the translator and the model what each term means on this site; edit one by clicking it.")).toBeInTheDocument();

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
    expect(screen.queryByText(/Definitions tell the translator/)).toBeNull();

    // An editor sees the placeholder where a definition is missing.
    render(<GlossaryTab viewerRole="editor" />);
    await screen.findByRole("button", { name: "Edit definition for anxiety" });
    expect(screen.getByRole("button", { name: "Edit definition for anxiety" })).toHaveTextContent("No definition yet");
  });

  it("cancels a collision without retrying or losing the edited rendering, then explicitly retries the captured edit", async () => {
    const api = stubGlossaryApi([row("Artist", "draft"), row("Replicator", "approved", "Künstler")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for Artist" });
    await user.clear(input);
    await user.type(input, "Künstler");
    api.refuseNextWrite();
    await user.keyboard("{Enter}");
    const warning = await screen.findByRole("dialog");
    expect(within(warning).getByText("Künstler")).toBeInTheDocument();
    expect(within(warning).getByText("Artist, Replicator")).toBeInTheDocument();
    expect(within(warning).getByText(`replication · ${LOCALE}`)).toBeInTheDocument();
    expect(api.calls).toHaveLength(1);
    await user.click(within(warning).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue("Künstler");
    expect(api.calls).toHaveLength(1);
    api.refuseNextWrite();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
    expect(api.calls).toHaveLength(2);
    expect(api.calls[1].body).toEqual({ locale: LOCALE, term: "Artist", target: "Künstler" });
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText('Saved "Artist" as Künstler; it is approved.');
    expect(api.calls[2]).toEqual({
      path: "/api/dev/translation-glossary/edit",
      body: { locale: LOCALE, term: "Artist", target: "Künstler", collisionConfirmation: "a".repeat(64) },
    });
  });

  it("asks again for changed collisions during individual approval and hands focus forward only after success", async () => {
    const api = stubGlossaryApi([row("Artist", "draft", "Künstler"), row("Next", "draft")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    const input = await screen.findByRole("textbox", { name: "Rendering for Artist" });
    api.refuseNextWrite();
    api.refuseNextWrite(["Artist", "Creator", "Replicator"], "b".repeat(64));
    input.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText("Artist, Creator, Replicator");
    expect(api.calls).toHaveLength(2);
    expect(input).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText('Approved "Artist".');
    expect(api.calls[2].body).toEqual({ locale: LOCALE, terms: ["Artist"], collisionConfirmation: "b".repeat(64) });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Rendering for Next" })).toHaveFocus());
  });

  it("preserves the full bulk selection through the shared-rendering confirmation", async () => {
    const api = stubGlossaryApi([row("Artist", "draft", "Künstler"), row("Replicator", "draft", "Künstler")]);
    const user = userEvent.setup();
    render(<GlossaryTab viewerRole="translator" />);
    await screen.findByText("Artist");
    api.refuseNextWrite();
    await user.click(screen.getByRole("button", { name: "Approve all 2 unreviewed terms shown" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve all shown" }));
    await screen.findByRole("button", { name: "Allow shared rendering" });
    expect(api.calls).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Allow shared rendering" }));
    await screen.findByText("Approved 2 terms.");
    expect(api.calls[1].body).toEqual({ locale: LOCALE, terms: ["Artist", "Replicator"], collisionConfirmation: "a".repeat(64) });
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
    await screen.findByText("Imported 2 approved and 1 unreviewed renderings.");
    expect(api.calls.map((call) => call.body)).toEqual([csv, csv]);
    const requests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/import?"));
    expect(new Headers(requests[0][1]?.headers).has("X-Glossary-Collision-Confirmation")).toBe(false);
    expect(new Headers(requests[1][1]?.headers).get("X-Glossary-Collision-Confirmation")).toBe("a".repeat(64));
  });
});
