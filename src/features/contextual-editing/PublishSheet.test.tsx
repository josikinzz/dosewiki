import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EDITOR_VERBS, PublishSheet, type PublishAction } from "./PublishSheet";
import { usePublicationReceipt } from "./usePublicationReceipt";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Harness({ onPublish, actions }: { onPublish?: (action: PublishAction) => Promise<void>; actions?: PublishAction[] }) {
  const { receipt, start } = usePublicationReceipt();
  return <PublishSheet
    changes={[{ field: "name", label: "Name", before: "Drifting", after: "Visual drifting" }]}
    targets={["/effects/drifting"]}
    actions={actions}
    note={{ value: "Renamed", onChange: () => {} }}
    receipt={receipt}
    onPublish={async (action) => {
      await onPublish?.(action);
      start([{ kind: "effect", slug: "drifting" }], [{ status: "pending", verification: "pending" }]);
    }}
  />;
}

const status = (state: "pending" | "delivered", translations: "pending" | "queued") =>
  Response.json({ ok: true, publications: [{ key: '{"kind":"effect","slug":"drifting"}', state, translations }] });

describe("the shared publish sheet", () => {
  it("updates its chips to 'Public: live' once the polled receipt completes", async () => {
    vi.useFakeTimers();
    const request = vi.fn()
      .mockResolvedValueOnce(status("pending", "pending"))
      .mockResolvedValueOnce(status("delivered", "queued"));
    vi.stubGlobal("fetch", request);
    render(<Harness />);

    fireEvent.click(within(screen.getByTestId("publish-sheet")).getByRole("button", { name: "Publish" }));
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish" })); });

    expect(screen.getByText("Editor host: saved")).toBeTruthy();
    expect(screen.getByText("Public: pending")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toBe(`/api/dev/publication-status?target=${encodeURIComponent('{"kind":"effect","slug":"drifting"}')}`);
    expect(screen.getByText("Public: pending")).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(screen.getByText("Public: live")).toBeTruthy();
    expect(screen.getByText("Translations: queued")).toBeTruthy();

    // Delivery settled, so polling stops.
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never publishes on a plain Enter; Cmd or Ctrl+Enter opens the one confirm", () => {
    const publish = vi.fn(async () => {});
    render(<Harness onPublish={publish} />);
    const note = screen.getByLabelText("Change note");
    fireEvent.keyDown(note, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(note, { key: "Enter", ctrlKey: true });
    const confirm = screen.getByRole("dialog", { name: /Publish this change/ });
    expect(within(confirm).getByText("/effects/drifting")).toBeTruthy();
    expect(publish).not.toHaveBeenCalled();
  });

  it("submits for review directly, without the publish confirm", async () => {
    const publish = vi.fn(async () => {});
    render(<Harness onPublish={publish} actions={["Submit for review"]} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit for review" })); });
    expect(publish).toHaveBeenCalledWith("Submit for review");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("editor verbs", () => {
  it("is the fixed set Save draft, Review, Publish, Submit for review", () => {
    expect([...EDITOR_VERBS]).toEqual(["Save draft", "Review", "Publish", "Submit for review"]);
  });

  it("offers only fixed-set verbs, plus Cancel, on the sheet itself", () => {
    render(<Harness actions={["Publish", "Submit for review"]} />);
    const labels = within(screen.getByTestId("publish-sheet")).getAllByRole("button").map((button) => button.textContent);
    for (const label of labels) expect([...EDITOR_VERBS, "Cancel"]).toContain(label);
  });

  // The verbs the five editors used before they shared one sheet.
  const RETIRED = [
    "Confirm publication", "Confirm publish correction", "Preview correction", "Review publication",
    "Review correction", "Review changes", "Review changes and history", "Submit proposal revision",
    "Submit for review instead", "Publish assignment", "Publish shared preset", "Keep editing",
    "Return to draft", "Keep your article edits?",
  ];
  const EDITORS = [
    "src/features/article/editing/ArticleContextBridge.editor.tsx",
    "src/features/effects/editing/EffectContextualEditor.editor.tsx",
    "src/features/reports/editing/PublishedReport.editor.tsx",
    "src/features/replications/viewer/editor/ReplicationViewerEditorPanel.tsx",
    "src/features/article/editing/WarningContextualEditor.editor.tsx",
    "src/features/dev/tools/warning-banners/PresetDrawer.tsx",
  ];
  it.each(EDITORS)("%s names no retired publish verb", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    for (const verb of RETIRED) {
      // As a string literal or as button text.
      expect(source, `${path} still says "${verb}"`).not.toContain(`"${verb}"`);
      expect(source, `${path} still says "${verb}"`).not.toContain(`>${verb}<`);
    }
  });
});
