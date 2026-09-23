import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { resetSearchManifestForTests } from "@/hooks/useSearchManifest";
import { NarrativeReview } from "./NarrativeReview";
afterEach(() => { vi.unstubAllGlobals(); resetSearchManifestForTests(); window.history.replaceState({}, "", "/"); });
it("reviews rendered field context and keeps an edited draft out of approval", async () => {
    const row = { id: "a".repeat(64), hash: "hash", field: "summary", source: "A source sentence.", context: "context", machine: { target: "机器翻译", model: "test", prompt_version: "v1" }, revision: 0, draft: null as null | {
            source: string;
            target: string;
            context: string;
        }, approved: null, status: "unreviewed", usages: { total: 1, pages: [] } };
    const packet = { locale: "zh-Hans", kind: "article", slug: "sample", sourceVersion: "b".repeat(64), rows: [row], history: [] };
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
        if (!init)
            return Response.json(packet);
        const body = JSON.parse(init.body);
        writes.push(body);
        row.revision++;
        row.draft = { source: row.source, target: body.target, context: row.context };
        row.status = "draft";
        return Response.json({ entry: row, publication: [] });
    }));
    const user = userEvent.setup();
    render(<NarrativeReview locale="zh-Hans"/>);
    await user.type(screen.getByRole("textbox", { name: "Source slug" }), "sample");
    await user.click(screen.getByRole("button", { name: "Load source" }));
    await user.click(await screen.findByRole("button", { name: "Review summary" }));
    const correction = await screen.findByRole("textbox", { name: "Correction" });
    await user.clear(correction);
    await user.type(correction, "审阅后的内容");
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Meaning");
    expect(screen.getByRole("button", { name: "Approve saved revision" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved. Published wording is unchanged.");
    expect(writes[0]).toMatchObject({ expectedRevision: 0, action: "save", sourceVersion: packet.sourceVersion });
    expect(screen.getByRole("button", { name: "Approve saved revision" })).toBeEnabled();
    await user.type(correction, "新");
    expect(screen.getByRole("button", { name: "Approve saved revision" })).toBeDisabled();
});
it("keeps a re-check approval on the preview and marks it in the field states", async () => {
 const approved={source:"2-Benzylpiperidine is a stimulant of the piperidine class.",target:"2-苄基哌啶是一种哌啶类兴奋剂。",context:"before neighbour edit"};
 const row={id:"a".repeat(64),hash:"hash",field:"toxicity.0",source:approved.source,context:"after neighbour edit",machine:{target:"机器翻译"},revision:1,draft:null,approved,overlay:"apply-recheck",status:"recheck",usages:null};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({locale:"zh-Hans",kind:"article",slug:"sample",sourceVersion:"v",rows:[row],history:[]})));
 const user=userEvent.setup();render(<NarrativeReview locale="zh-Hans"/>);
 await user.type(screen.getByRole("textbox",{name:"Source slug"}),"sample");await user.click(screen.getByRole("button",{name:"Load source"}));
 expect(await screen.findByText(approved.target)).toBeInTheDocument();
 expect(screen.queryByText("机器翻译")).not.toBeInTheDocument();
 expect(screen.getByText("Re-check: nearby English changed")).toBeInTheDocument();
 // The field dropdown gave way to per-paragraph marks in the parallel view.
 expect(within(screen.getAllByRole("listitem")[0]).getByText("Re-check: nearby English changed")).toBeInTheDocument();
});
it("keeps Approve disabled while the saved draft belongs to older source context", async () => {
 const draft={source:"2-Benzylpiperidine is a stimulant of the piperidine class.",target:"2-苄基哌啶是一种哌啶类兴奋剂。",context:"before neighbour edit"};
 const row={id:"a".repeat(64),hash:"hash",field:"toxicity.0",source:draft.source,context:"after neighbour edit",machine:{target:"机器翻译"},revision:1,draft,approved:null,overlay:null,status:"draft",usages:null};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({locale:"zh-Hans",kind:"article",slug:"sample",sourceVersion:"v",rows:[row],history:[]})));
 const user=userEvent.setup();render(<NarrativeReview locale="zh-Hans"/>);
 await user.type(screen.getByRole("textbox",{name:"Source slug"}),"sample");await user.click(screen.getByRole("button",{name:"Load source"}));
 await user.click(await screen.findByRole("button",{name:"Review toxicity.0"}));
 await waitFor(()=>expect(screen.getByRole("textbox",{name:"Correction"})).toHaveFocus());
 await user.type(screen.getByRole("textbox",{name:"Reason"}),"Meaning");
 expect(screen.getByRole("textbox",{name:"Correction"})).toHaveValue(draft.target);
 expect(screen.getByRole("button",{name:"Approve saved revision"})).toBeDisabled();
});
it("refuses to edit from a stale field preview", async () => {
 const row={id:"a".repeat(64),field:"summary",source:"Old source",context:"old",machine:{target:"旧译文"},revision:0,draft:null,approved:null,status:"unreviewed",usages:null};
 let calls=0;
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({locale:"zh-Hans",kind:"article",slug:"sample",sourceVersion:++calls===1?"old":"new",rows:[{...row,source:calls===1?"Old source":"Changed source"}],history:[]})));
 const user=userEvent.setup();render(<NarrativeReview locale="zh-Hans"/>);
 await user.type(screen.getByRole("textbox",{name:"Source slug"}),"sample");await user.click(screen.getByRole("button",{name:"Load source"}));
 await user.click(await screen.findByRole("button",{name:"Review summary"}));
 await screen.findByText("Source context changed since the preview. Inspect the refreshed text and select the field again.");
 expect(screen.queryByRole("textbox",{name:"Correction"})).not.toBeInTheDocument();
});
it("opens a bookmark at its exact field and rejects an old bookmarked source version", async () => {
 const id="a".repeat(64);
 window.history.replaceState({},"",`/dev/glossary?translationReview=article&translationLocale=zh-Hans&translationSlug=sample&translationSegment=${id}&translationVersion=old`);
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({locale:"zh-Hans",kind:"article",slug:"sample",sourceVersion:"new",rows:[{id,field:"summary",source:"Changed source",context:"context",revision:0,draft:null,approved:null,machine:null,status:"unreviewed",usages:null}],history:[]})));
 render(<NarrativeReview locale="zh-Hans"/>);
 await screen.findByText("Source context changed since the preview. Inspect the refreshed text and select the field again.");
 expect(screen.getByRole("textbox",{name:"Source slug"})).toHaveValue("sample");
 expect(screen.queryByRole("textbox",{name:"Correction"})).not.toBeInTheDocument();
});
const manifest = (locale: string, label: string) => ({ locale, version: "v", shape: 2, entries: [
 { id: "substance:2c-b", type: "substance", label, slug: "2c-b", aliases: ["Nexus"] },
 { id: "substance:mdma", type: "substance", label: "MDMA", slug: "mdma" },
 { id: "effect:2c-b-glow", type: "effect", label: "2C-B glow", slug: "2c-b-glow" },
] });
const twoParagraphs = () => {
 const base = { hash: "hash", field: "sections.overview", context: "context", revision: 0, draft: null, usages: null };
 return { locale: "zh-Hans", kind: "article", slug: "2c-b", sourceVersion: "c".repeat(64), tally: { humanApproved: 1, total: 2 }, history: [], rows: [
  { ...base, id: "d".repeat(64), source: "2C-B is a psychedelic phenethylamine.", machine: { target: "2C-B 是一种迷幻苯乙胺。" }, approved: null as null | { source: string; context: string; target: string }, overlay: null as null | string, status: "unreviewed" },
  { ...base, id: "e".repeat(64), source: "It was first synthesized in 1974.", machine: { target: "机器译文" }, approved: { source: "It was first synthesized in 1974.", context: "context", target: "它于 1974 年首次合成。" } as null | { source: string; context: string; target: string }, overlay: "apply" as null | string, status: "approved" },
 ] };
};
const localeOf = (url: string) => new URL(url, "https://dev.dose.wiki").searchParams.get("locale") ?? "";
it("finds an article by its English title and loads the parallel reading view", async () => {
 const requests: string[] = [];
 vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  requests.push(url);
  if (url.startsWith("/api/search-manifest")) return Response.json(manifest(localeOf(url), "2C-B"));
  return Response.json(twoParagraphs());
 }));
 const user = userEvent.setup();
 render(<NarrativeReview locale="zh-Hans"/>);
 await user.type(screen.getByRole("combobox", { name: "Find article" }), "2C-B");
 const option = await screen.findByRole("option", { name: /2C-B/ });
 expect(screen.queryByRole("option", { name: /MDMA/ })).not.toBeInTheDocument();
 expect(screen.queryByRole("option", { name: /glow/ })).not.toBeInTheDocument();
 await user.click(option);
 expect(await screen.findByText("1 of 2 paragraphs human approved")).toBeInTheDocument();
 expect(requests.some(u => u.includes("/api/dev/translation-narrative?") && u.includes("slug=2c-b"))).toBe(true);
 expect(requests.some(u => u.includes("search-manifest?locale=zh-Hans"))).toBe(true);
 const pairs = screen.getAllByRole("listitem");
 expect(within(pairs[0]).getByText("2C-B is a psychedelic phenethylamine.")).toBeInTheDocument();
 expect(within(pairs[0]).getByText("2C-B 是一种迷幻苯乙胺。")).toBeInTheDocument();
 expect(within(pairs[0]).getByText("Machine")).toBeInTheDocument();
 expect(within(pairs[1]).getByText("它于 1974 年首次合成。")).toBeInTheDocument();
 expect(within(pairs[1]).getByText("Human approved")).toBeInTheDocument();
 expect(new URL(window.location.href).searchParams.get("translationSlug")).toBe("2c-b");
});
it("finds an article through the locale manifest when English has no match", async () => {
 vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  if (url.startsWith("/api/search-manifest")) return Response.json(localeOf(url) === "en" ? { ...manifest("en", "2C-B"), entries: [] } : manifest(localeOf(url), "2C-B"));
  return Response.json(twoParagraphs());
 }));
 const user = userEvent.setup();
 render(<NarrativeReview locale="zh-Hans"/>);
 await user.type(screen.getByRole("combobox", { name: "Find article" }), "Nexus");
 expect(await screen.findByRole("option", { name: /2C-B/ })).toHaveAttribute("aria-selected", "true");
 await user.keyboard("{Enter}");
 expect(await screen.findByText("1 of 2 paragraphs human approved")).toBeInTheDocument();
});
it("opens the correction editor in place when a paragraph is clicked and marks each state", async () => {
 const packet = twoParagraphs();
 packet.rows[0] = { ...packet.rows[0], status: "stale" };
 vi.stubGlobal("fetch", vi.fn(async () => Response.json(packet)));
 const user = userEvent.setup();
 render(<NarrativeReview locale="zh-Hans"/>);
 await user.type(screen.getByRole("textbox", { name: "Source slug" }), "2c-b");
 await user.click(screen.getByRole("button", { name: "Load source" }));
 expect(await screen.findByText("Source changed")).toBeInTheDocument();
 await user.click(screen.getByRole("button", { name: "Review sections.overview paragraph 2" }));
 const correction = await screen.findByRole("textbox", { name: "Correction" });
 await waitFor(() => expect(correction).toHaveFocus());
 expect(correction).toHaveValue("它于 1974 年首次合成。");
 expect(within(screen.getAllByRole("listitem")[1]).getByRole("textbox", { name: "Correction" })).toBe(correction);
 expect(new URL(window.location.href).searchParams.get("translationSegment")).toBe("e".repeat(64));
 expect(screen.queryByRole("combobox", { name: "Source field" })).not.toBeInTheDocument();
});
it("opens the paragraph named by a translationSegment deep link", async () => {
 const packet = twoParagraphs();
 window.history.replaceState({}, "", `/dev/glossary?translationReview=article&translationLocale=zh-Hans&translationSlug=2c-b&translationSegment=${"d".repeat(64)}&translationVersion=${packet.sourceVersion}`);
 vi.stubGlobal("fetch", vi.fn(async () => Response.json(packet)));
 render(<NarrativeReview locale="zh-Hans"/>);
 const correction = await screen.findByRole("textbox", { name: "Correction" });
 await waitFor(() => expect(correction).toHaveFocus());
 expect(correction).toHaveValue("2C-B 是一种迷幻苯乙胺。");
 expect(within(screen.getAllByRole("listitem")[0]).getByRole("textbox", { name: "Correction" })).toBe(correction);
});
