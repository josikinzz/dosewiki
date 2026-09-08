import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { splitAboutMarkdown } from "./aboutSections";

const renderMarkdown = (content: string) => renderToStaticMarkup(createElement(ReactMarkdown, { children: content }));

describe("splitAboutMarkdown", () => {
  it("keeps unsectioned Markdown intact, including fenced and quoted section headings", () => {
    const content = "Intro.\n\n```md\n## Sources and review\n```\n\n> ## Project history\n> Quoted history.\n\n### Sources and review\nNot a boundary.\n";
    expect(splitAboutMarkdown(content)).toEqual({ introduction: content, sources: "", history: "" });
  });

  it("places bodies by reserved headings while retaining unknown headings and repeated sections", () => {
    const content = [
      "Introduction.", "## Background", "Still introduction.",
      "## SOURCES AND REVIEW", "Sources.", "### Limits", "Source limits.",
      "## Other sources", "More source detail.",
      "## Project history", "History.", "## Sources and review", "Additional sources.",
    ].join("\n\n");
    const sections = splitAboutMarkdown(content);
    expect(renderMarkdown(sections.introduction)).toBe(renderMarkdown("Introduction.\n\n## Background\n\nStill introduction."));
    expect(renderMarkdown(sections.sources)).toBe(renderMarkdown("Sources.\n\n### Limits\n\nSource limits.\n\n## Other sources\n\nMore source detail.\n\nAdditional sources."));
    expect(renderMarkdown(sections.history)).toBe(renderMarkdown("History."));
  });

  it("ignores fenced and nested boundaries inside a section and accepts setext level-two headings", () => {
    const sources = "Sources.\n\n~~~md\n## Project history\n~~~\n\n> ## Project history\n> A quotation.\n\n- ## Project history\n  A list item.";
    expect(splitAboutMarkdown(`Intro.\n\nSources and review\n------------------\n\n${sources}\n\n## Project history\n\nActual history.`)).toEqual({
      introduction: "Intro.", sources, history: "Actual history.",
    });
  });

  it("resolves links and images whose definitions live in another projected body", () => {
    const content = "Read [research][paper].\n\n## Sources and review\n\n![Archive][image]\n\n[paper]: https://example.org/paper \"Research\"\n\n## Project history\n\n[Research again][paper].\n\n[image]: https://example.org/archive.png";
    const { introduction, sources, history } = splitAboutMarkdown(content);
    expect(renderMarkdown(introduction)).toContain('<a href="https://example.org/paper" title="Research">research</a>');
    expect(renderMarkdown(sources)).toContain('<img src="https://example.org/archive.png" alt="Archive"');
    expect(renderMarkdown(history)).toContain('<a href="https://example.org/paper" title="Research">Research again</a>');
  });

  it("preserves document-first definitions, including multiline definitions nested in quotes", () => {
    const content = "[Read][paper]\n\n> [paper]: <https://example.org/original>\n>   \"Original research\"\n\n## Sources and review\n\n[Read][paper]\n\n[paper]: https://example.org/duplicate\n\n## Project history\n\n[Read][paper]";
    for (const body of Object.values(splitAboutMarkdown(content))) {
      expect(renderMarkdown(body)).toContain('<a href="https://example.org/original" title="Original research">Read</a>');
      expect(renderMarkdown(body)).not.toContain('href="https://example.org/duplicate"');
    }
  });
});
