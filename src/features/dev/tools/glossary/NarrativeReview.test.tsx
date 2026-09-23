import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { NarrativeReview } from "./NarrativeReview";
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
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
 expect(screen.getByRole("option",{name:"toxicity.0: Re-check: nearby English changed"})).toBeInTheDocument();
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
