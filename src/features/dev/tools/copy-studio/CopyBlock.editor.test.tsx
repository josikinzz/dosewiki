// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextualEditingContext } from "@/features/contextual-editing/context";
import CopyBlock from "./CopyBlock.editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const KEY = "footer-tagline";
type Row = { key: string; kind: "plain"; label: string; group: string; body: string; revision: number };
const row = (body: string, revision: number): Row => ({ key: KEY, kind: "plain", label: "Footer tagline", group: "Footer", body, revision });
type Answer = { status: number; json: unknown };

function serve(initial: Row, onPublish: (attempt: number, body: Record<string, unknown>) => Answer) {
  const store = { current: initial };
  const publishes: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return Response.json({ document: store.current, revision: store.current.revision });
    const body = JSON.parse(String(init.body));
    publishes.push(body);
    const answer = onPublish(publishes.length, body);
    return Response.json(answer.json, { status: answer.status });
  }));
  return { store, publishes };
}

async function openEditor() {
  const user = userEvent.setup();
  render(
    <ContextualEditingContext.Provider value={{ enabled: true, mode: "edit", role: "admin", email: "admin@example.com", setDirty: () => {}, registerDraftGuard: () => () => {} }}>
      <CopyBlock copyKey={KEY} />
    </ContextualEditingContext.Provider>,
  );
  await user.click(screen.getByRole("button", { name: `Edit ${KEY} copy` }));
  const field = await screen.findByRole("textbox");
  return { user, field: field as HTMLTextAreaElement };
}

async function confirmIn(user: ReturnType<typeof userEvent.setup>, trigger: string, confirmLabel: string) {
  await user.click(screen.getByRole("button", { name: trigger }));
  const dialogs = await screen.findAllByRole("dialog");
  await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: confirmLabel }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("contextual copy editor revisions", () => {
  it("publishes against the current revision after a replayed publication, not the replay receipt", async () => {
    const server = serve(row("Original.", 4), (attempt) => {
      if (attempt === 1) {
        server.store.current = row("Newer from another admin.", 6);
        return { status: 502, json: { error: "The response was lost." } };
      }
      if (attempt === 2) return { status: 200, json: { revision: 5, replayed: true, unchanged: false } };
      return { status: 200, json: { revision: 7, replayed: false, unchanged: false } };
    });
    const { user, field } = await openEditor();
    await user.type(field, " Mine.");
    await confirmIn(user, "Publish copy", "Publish copy");
    await screen.findByText("The response was lost.");
    await confirmIn(user, "Publish copy", "Publish copy");
    await waitFor(() => expect(field.value).toBe("Newer from another admin."));
    await user.type(field, " Follow-up.");
    await confirmIn(user, "Publish copy", "Publish copy");
    await waitFor(() => expect(server.publishes).toHaveLength(3));
    expect(server.publishes[2]).toMatchObject({ expectedRevision: 6, expected: { body: "Newer from another admin." }, body: "Newer from another admin. Follow-up." });
  });

  it("loads the latest version after a conflict and publishes against it", async () => {
    const server = serve(row("Original.", 4), (_attempt, body) => body.expectedRevision === server.store.current.revision
      ? { status: 200, json: { revision: server.store.current.revision + 1, replayed: false, unchanged: false } }
      : { status: 409, json: { error: "Published content changed.", code: "EDIT_CONFLICT" } });
    const { user, field } = await openEditor();
    server.store.current = row("Theirs.", 5);
    await user.type(field, " Mine.");
    await confirmIn(user, "Publish copy", "Publish copy");
    await confirmIn(user, "Load the latest version", "Load latest");
    await waitFor(() => expect(field.value).toBe("Theirs."));
    await user.type(field, " Mine again.");
    await confirmIn(user, "Publish copy", "Publish copy");
    await waitFor(() => expect(server.publishes).toHaveLength(2));
    expect(server.publishes.map((body) => body.expectedRevision)).toEqual([4, 5]);
    expect(server.publishes[1]).toMatchObject({ expected: { body: "Theirs." }, body: "Theirs. Mine again." });
  });
});
