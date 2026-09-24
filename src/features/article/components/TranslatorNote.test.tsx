import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import { ArticleLayout } from "./ArticleLayout";
import { translatorNoteNodes } from "./TranslatorNote";

// The first render of the whole layout is slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 });
const NOTE = "在中国，2-苄基哌啶未被单独列管，但可能按类似物处理。";
const article = {
  ...createEmptyArticle(),
  slug: "2-benzylpiperidine",
  title: "2-Benzylpiperidine",
  history_culture: { content: "2-Benzylpiperidine was first described in the 1950s.", sections: [] },
} as unknown as SubstanceArticle;

describe("translator's notes on a localized article", () => {
  it("renders an approved note in its section, labelled as not in the English original", () => {
    render(<ArticleLayout article={article} translatorNotes={translatorNoteNodes("zh-Hans", { "history-culture": NOTE })} />);
    const box = screen.getByRole("complementary", { name: "译者注" });
    expect(box).toHaveTextContent(NOTE);
    expect(box).toHaveTextContent("英文原文中没有此内容");
    // The box closes the History & Culture section, not another one.
    expect(box.parentElement?.querySelector("#history-culture")).not.toBeNull();
  });

  it("renders nothing for a section without an approved note, and nothing on the English page", () => {
    // The route passes approved notes only; a draft never reaches the layout.
    const { unmount } = render(<ArticleLayout article={article} translatorNotes={translatorNoteNodes("zh-Hans", {})} />);
    expect(screen.queryByRole("complementary", { name: "译者注" })).not.toBeInTheDocument();
    unmount();
    const { container } = render(<ArticleLayout article={article} />);
    expect(container.querySelector("[data-translator-note]")).toBeNull();
  });

  it("speaks Russian on the Russian mirror", () => {
    render(<ArticleLayout article={article} translatorNotes={translatorNoteNodes("ru", { "history-culture": "Примечание." })} />);
    const box = screen.getByRole("complementary", { name: "Примечание переводчика" });
    expect(box).toHaveTextContent("В английском оригинале этого нет.");
  });
});
