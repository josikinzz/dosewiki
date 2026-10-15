import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useMemo } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArticleRecord } from "../context/devModeTypes";
import { useEditorDocument } from "../context/editorDocumentSession";
import { DraftRecoveryProvider } from "../recovery/DraftRecoveryContext";
import { StagedArticlesRecoveryNotice } from "./StagedArticlesRecoveryNotice";
import { useStagedArticlesRecovery } from "./useStagedArticlesRecovery";

type Row = { slug: string; name: string; tags: string[] };
const asRecord = (row: Row) => row as unknown as ArticleRecord;

let library: Row[];

/**
 * A stand-in for the shell: the staged working set as a real editor document
 * session over the library, one tag field for the first article, and the
 * recovery notice the shell renders above every tool.
 */
function Shell({ source }: { source: Row[] }) {
  const articles = useMemo(() => source.map(asRecord), [source]);
  const document = useEditorDocument<ArticleRecord[]>(articles);
  const hydrateArticlesNow = useCallback(async (slugs: readonly string[]) => {
    const response = await fetch(`/api/dev/editor-library?slugs=${slugs.join(",")}`);
    const payload = (await response.json()) as { articles: Row[] };
    return { ok: true, articles: payload.articles.map(asRecord) };
  }, []);
  const recovery = useStagedArticlesRecovery({
    articles: document.draft,
    getOriginalArticles: document.getOriginal,
    getArticleBaseHashes: () => Object.fromEntries(source.map(row => [row.slug, `stored-${row.slug}`])),
    applyArticlesTransform: document.applyDraftTransform,
    hydrateArticlesNow,
    hasChanges: document.isDirty,
    libraryReady: true,
  });
  const first = document.draft[0] as unknown as Row;
  return (
    <>
      <StagedArticlesRecoveryNotice recovery={recovery} showSaveTime />
      <input
        aria-label={`Tags for ${first.slug}`}
        value={first.tags.join(",")}
        onChange={(event) =>
          document.applyDraftTransform((previous) => [
            asRecord({ ...(previous[0] as unknown as Row), tags: event.target.value.split(",") }),
            ...previous.slice(1),
          ])
        }
      />
      <input
        aria-label={`Name for ${first.slug}`}
        value={first.name}
        onChange={(event) =>
          document.applyDraftTransform((previous) => [
            asRecord({ ...(previous[0] as unknown as Row), name: event.target.value }),
            ...previous.slice(1),
          ])
        }
      />
      <output aria-label="Working set">{JSON.stringify(document.draft)}</output>
    </>
  );
}

function renderShell(actor = "editor@example.com") {
  return render(
    <DraftRecoveryProvider actor={actor}>
      <Shell source={library} />
    </DraftRecoveryProvider>,
  );
}

function workingSet(): Row[] {
  return JSON.parse(screen.getByLabelText("Working set").textContent ?? "[]") as Row[];
}

describe("staged working set recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    library = [
      { slug: "lsd", name: "LSD", tags: ["psychedelic"] },
      { slug: "mdma", name: "MDMA", tags: ["entactogen"] },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ articles: library })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not offer one account's edits to another", async () => {
    const user = userEvent.setup();
    const first = renderShell("first@example.com");
    await user.type(screen.getByLabelText("Tags for lsd"), ",mine");
    await screen.findByText(/Uncommitted article edits kept in this browser at/);
    first.unmount();

    renderShell("second@example.com");
    expect(screen.queryByRole("region", { name: "Recovered article edits" })).not.toBeInTheDocument();
  });

  it("holds an edit aside when its article changed since, keeping the newer version", async () => {
    const user = userEvent.setup();
    const first = renderShell();
    await user.type(screen.getByLabelText("Tags for lsd"), ",mine");
    await screen.findByText(/Uncommitted article edits kept in this browser at/);
    first.unmount();

    library = [{ ...library[0], tags: ["psychedelic", "theirs"] }, library[1]];
    renderShell();
    const offer = await screen.findByRole("region", { name: "Recovered article edits" });
    await user.click(within(offer).getByRole("button", { name: "Restore" }));

    const held = await screen.findByRole("region", { name: "Article edits held aside" });
    expect(within(held).getByText(/lsd: tags/)).toBeInTheDocument();
    expect(workingSet()[0].tags).toEqual(["psychedelic", "theirs"]);

    // Applying merges: the newer tag stays, and the copy's tag joins it.
    await user.click(within(held).getByRole("button", { name: "Apply my edits to lsd" }));
    expect(workingSet()[0].tags).toEqual(["psychedelic", "theirs", "mine"]);
  });
});
