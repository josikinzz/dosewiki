import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem, InboxResponse } from "@lib/translation/reviewInboxTypes";
import { ReviewInbox } from "./ReviewInbox";

const term = (name: string, target: string): InboxItem => ({
  scope: "glossary", id: name, reason: "glossary-never-checked", english: name, live: target, where: "effect-name",
  revision: "10:0", href: `/dev/glossary?translationTerm=${name}`, accept: { kind: "glossary-confirm", term: name, expectedRevision: "10:0" },
});
const response = (items: InboxItem[], total = items.length): InboxResponse => ({
  ok: true, locale: "zh-Hans", items, total, offset: 0, pageSize: 50,
  checked: ["narrative-source-changed", "ui-source-changed", "narrative-recheck", "glossary-never-checked"],
  counts: {}, reason: null,
});
const disagreement: InboxItem = {
  scope: "segment", id: "a1b2c3d4e5f60718:Phenidate", reason: "glossary-disagreement",
  english: "2-Benzylpiperidine is a stimulant related to other phenidates.", live: "2-苄基哌啶是一种兴奋剂，与其他 phenidates 相关。",
  detail: "Glossary: Phenidate → 哌甲酯类", where: "article · 2-benzylpiperidine", revision: "5", href: "/dev/glossary?translationSegment=x", accept: null,
  exception: { finding: "glossary-disagreement", hash: "a1b2c3d4e5f60718", term: "Phenidate", revision: "5" },
};
const suggestion: InboxItem = {
  scope: "feedback", id: "feedback-1", reason: "reader-suggestion", english: "Replication", live: "再现作品", suggestion: "体验再现",
  detail: "Reader: 体验再现 reads more naturally", where: "Public glossary · 2026-09-20", revision: "new",
  href: "/dev/glossary?translationTerm=Replication", accept: { kind: "feedback-resolve", id: "feedback-1" },
};

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Review inbox", () => {
  it("accepts the focused item with A through the existing confirm mutation and moves focus to the next item", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!init) return Response.json(response([term("Euphoria", "欣快"), term("Anxiety", "焦虑")]));
      writes.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, confirmed: ["Euphoria"] });
    }));
    const user = userEvent.setup();
    render(<ReviewInbox locale="zh-Hans" />);
    const first = await screen.findByRole("listitem", { name: "Glossary: Euphoria" });
    first.focus();
    await user.keyboard("a");
    expect(await screen.findByText('Accepted "Euphoria".')).toBeInTheDocument();
    expect(writes).toEqual([{ url: "/api/dev/translation-glossary/confirm", body: expect.objectContaining({ locale: "zh-Hans", terms: ["Euphoria"], expectedRevisions: { Euphoria: "10:0" } }) }]);
    expect(screen.queryByRole("listitem", { name: "Glossary: Euphoria" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Glossary: Anxiety" })).toHaveFocus();
    expect(screen.getByTestId("inbox-summary")).toHaveTextContent("1 item needs a person");
  });

  it("moves with J and K, skips with S for the session, and opens the editor with E", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response([term("Euphoria", "欣快"), term("Anxiety", "焦虑"), term("Drifting", "漂移")]))));
    const opened: string[] = [];
    const user = userEvent.setup();
    const { unmount } = render(<ReviewInbox locale="zh-Hans" onOpen={(href) => opened.push(href)} />);
    (await screen.findByRole("listitem", { name: "Glossary: Euphoria" })).focus();
    await user.keyboard("j");
    expect(screen.getByRole("listitem", { name: "Glossary: Anxiety" })).toHaveFocus();
    await user.keyboard("k");
    expect(screen.getByRole("listitem", { name: "Glossary: Euphoria" })).toHaveFocus();
    await user.keyboard("s");
    expect(screen.queryByRole("listitem", { name: "Glossary: Euphoria" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Glossary: Anxiety" })).toHaveFocus();
    await user.keyboard("e");
    expect(opened).toEqual(["/dev/glossary?translationTerm=Anxiety"]);
    // A skip lasts for the session, not just this render.
    unmount();
    render(<ReviewInbox locale="zh-Hans" />);
    await screen.findByRole("listitem", { name: "Glossary: Anxiety" });
    expect(screen.queryByRole("listitem", { name: "Glossary: Euphoria" })).not.toBeInTheDocument();
  });

  it("keeps the item and reports the conflict when Accept meets a stale revision", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init
      ? Response.json({ error: "This translation changed since you opened it. Reload and review the latest revision." }, { status: 409 })
      : Response.json(response([term("Euphoria", "欣快")]))));
    const user = userEvent.setup();
    render(<ReviewInbox locale="zh-Hans" />);
    await user.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/changed since you opened it/)).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Glossary: Euphoria" })).toBeInTheDocument();
  });

  it("marks a QA finding fine here with F and records the exception it names", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!init) return Response.json(response([disagreement, term("Anxiety", "焦虑")]));
      writes.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true });
    }));
    const user = userEvent.setup();
    render(<ReviewInbox locale="zh-Hans" />);
    const first = await screen.findByRole("listitem", { name: `Translation: ${disagreement.english}` });
    expect(first).toHaveTextContent("Glossary: Phenidate → 哌甲酯类");
    first.focus();
    await user.keyboard("f");
    expect(await screen.findByText(/Marked fine here/)).toBeInTheDocument();
    expect(writes).toEqual([{ url: "/api/dev/translation-inbox/exception", body: { locale: "zh-Hans", finding: "glossary-disagreement", hash: "a1b2c3d4e5f60718", term: "Phenidate", revision: "5" } }]);
    expect(screen.getByRole("listitem", { name: "Glossary: Anxiety" })).toHaveFocus();
  });

  it("resolves a reader suggestion through the existing feedback status route", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!init) return Response.json(response([suggestion]));
      writes.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, feedback: { id: "feedback-1", status: "resolved" } });
    }));
    const user = userEvent.setup();
    render(<ReviewInbox locale="zh-Hans" />);
    expect(await screen.findByText("体验再现")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText('Resolved the suggestion on "Replication".')).toBeInTheDocument();
    expect(writes).toEqual([{ url: "/api/glossary-feedback/feedback-1/status", body: expect.objectContaining({ status: "resolved" }) }]);
    expect(screen.queryByRole("listitem", { name: "Reader: Replication" })).not.toBeInTheDocument();
  });

  it("says nothing needs a person and names the scopes it checked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(response([]))));
    render(<ReviewInbox locale="zh-Hans" />);
    expect(await screen.findByText("Nothing needs a person right now")).toBeInTheDocument();
    const checked = screen.getByText(/^Checked /);
    expect(checked).toHaveTextContent("glossary terms that are live but never checked");
    expect(checked).toHaveTextContent("UI labels whose English changed after approval");
    expect(checked).toHaveTextContent("article sentences whose English changed after approval");
  });
});
