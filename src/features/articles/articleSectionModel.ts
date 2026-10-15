import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { IconName } from "@/components/common/Icon";
import type { PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";
import {
  createVCodeHeadingIdAssigner,
  extractMarkdownHeadings,
  extractVCodeHeadings,
  flattenMarkdownHeadingText,
  flattenVCodeHeadingText,
  type VCodeHeading,
} from "@/features/effects/vcode/headings";
import { normalizeVCodeContent, unwrapTopLevelQuotes } from "@/features/effects/vcode/normalize";
import type { VCodeContent, VCodeNode } from "@/features/effects/vcode/types";
import { icons } from "@/utils/iconNames";

export type ArticleBodyContent =
  | { format: "vcode"; content: (string | VCodeNode)[] }
  | { format: "markdown"; content: string };

interface ArticleSectionBase {
  id: string;
  body: ArticleBodyContent;
}

export interface ArticleOverviewSectionModel extends ArticleSectionBase {
  kind: "overview";
}

export interface ArticleProseSectionModel extends ArticleSectionBase {
  kind: "section";
  title: string;
  icon: IconName;
}

export interface ArticleCommentaryAttribution {
  name: string;
}

export interface ArticleCommentarySectionModel extends ArticleSectionBase {
  kind: "personalCommentary";
  title: string;
  icon: IconName;
  attribution?: ArticleCommentaryAttribution;
}

export type ArticleSectionModel =
  | ArticleOverviewSectionModel
  | ArticleProseSectionModel
  | ArticleCommentarySectionModel;

export interface ArticleModel {
  sections: ArticleSectionModel[];
  tocItems: PublicTableOfContentsItem[];
  sectionIds: string[];
}

export const ARTICLE_OVERVIEW_SECTION_ID = "overview";
const COMMENTARY_ICON: IconName = "lucide:quote";
const DEFAULT_SECTION_ICON: IconName = icons.bookOpenText;

const SECTION_ICONS_BY_TITLE: ReadonlyArray<{ match: RegExp; icon: IconName }> = [
  { match: /^duration\b/i, icon: icons.clock },
  { match: /intensity scale/i, icon: "lucide:gauge" },
  { match: /^see also$/i, icon: "lucide:link" },
  { match: /^references$/i, icon: icons.listOrdered },
  { match: /^external links$/i, icon: icons.library },
  { match: /dream/i, icon: icons.moon },
  { match: /memory|recall/i, icon: icons.brain },
  { match: /meditation|mindfulness/i, icon: icons.sparkles },
];

const COMMENTARY_TITLE_PATTERN = /^personal commentary$/i;
const MARKDOWN_HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const MARKDOWN_FENCE_PATTERN = /^(?:```|~~~)/;

const TOC_MIN_ITEMS = 2;
const DEFAULT_SECTION_LEVEL = 2;
const DEEPEST_REAL_HEADING_LEVEL = 4;

function sectionIconFor(title: string): IconName {
  return SECTION_ICONS_BY_TITLE.find((entry) => entry.match.test(title))?.icon ?? DEFAULT_SECTION_ICON;
}

function findSectionLevel(headings: VCodeHeading[]): number {
  const realLevels = headings
    .map((heading) => heading.level)
    .filter((level) => level <= DEEPEST_REAL_HEADING_LEVEL);

  return realLevels.length > 0 ? Math.min(...realLevels) : DEFAULT_SECTION_LEVEL;
}

function findOutlineLevel(headings: VCodeHeading[]): number | undefined {
  const levels = [...new Set(headings.map((heading) => heading.level))].sort((a, b) => a - b);

  return levels.find(
    (level) => headings.filter((heading) => heading.level === level).length >= TOC_MIN_ITEMS,
  );
}

interface Cut<T> {
  title?: string;
  content: T[];
}

function cutVCodeBody(nodes: (string | VCodeNode)[], level: number): Cut<string | VCodeNode>[] {
  const headingTag = `h${level}`;
  const cuts: Cut<string | VCodeNode>[] = [{ content: [] }];

  for (const node of nodes) {
    if (typeof node === "string") {
      cuts[cuts.length - 1].content.push(node);
      continue;
    }

    if (node.name === headingTag) {
      cuts.push({ title: flattenVCodeHeadingText(node.children).trim(), content: [] });
      continue;
    }

    if (node.name === "markdown") {
      const text = (node.properties.text ?? "").trim();
      const [firstLine, ...rest] = text.split("\n");
      const match = MARKDOWN_HEADING_LINE.exec(firstLine.trim());

      if (match && match[1].length === level) {
        cuts.push({ title: flattenMarkdownHeadingText(match[2]), content: [] });
        const remainder = rest.join("\n").trim();

        if (remainder) {
          cuts[cuts.length - 1].content.push({
            ...node,
            properties: { ...node.properties, text: remainder },
          });
        }
        continue;
      }
    }

    cuts[cuts.length - 1].content.push(node);
  }

  return cuts;
}

function trimVCodeCut(content: (string | VCodeNode)[]): (string | VCodeNode)[] {
  let end = content.length;

  while (end > 0) {
    const node = content[end - 1];
    const isBlank = typeof node === "string" ? node.trim().length === 0 : node.name === "hr";

    if (!isBlank) {
      break;
    }
    end -= 1;
  }

  let start = 0;

  while (start < end) {
    const node = content[start];

    if (typeof node !== "string" || node.trim().length > 0) {
      break;
    }
    start += 1;
  }

  return content.slice(start, end);
}

function cutMarkdownBody(markdown: string, level: number): Cut<string>[] {
  const cuts: Cut<string>[] = [{ content: [] }];
  let inFence = false;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (MARKDOWN_FENCE_PATTERN.test(line)) {
      inFence = !inFence;
    }

    const match = inFence ? null : MARKDOWN_HEADING_LINE.exec(line);

    if (match && match[1].length === level) {
      cuts.push({ title: flattenMarkdownHeadingText(match[2]), content: [] });
      continue;
    }

    cuts[cuts.length - 1].content.push(rawLine);
  }

  return cuts;
}

function firstQuoteAuthor(nodes: (string | VCodeNode)[]): string | undefined {
  for (const node of nodes) {
    if (typeof node !== "string" && node.name === "quote") {
      const author = node.properties.author?.trim();

      if (author) {
        return author;
      }
    }
  }

  return undefined;
}

function assignSectionIds(titles: string[]): string[] {
  const assign = createVCodeHeadingIdAssigner([ARTICLE_OVERVIEW_SECTION_ID]);

  return titles.map((title, index) => assign(title) ?? `section-${index + 1}`);
}

function toSection(
  id: string,
  title: string,
  body: ArticleBodyContent,
  quoteAuthor: string | undefined,
): ArticleProseSectionModel | ArticleCommentarySectionModel {
  if (COMMENTARY_TITLE_PATTERN.test(title)) {
    return {
      kind: "personalCommentary",
      id,
      title,
      icon: COMMENTARY_ICON,
      body:
        body.format === "vcode"
          ? { format: "vcode", content: unwrapTopLevelQuotes(body.content) }
          : body,
      ...(quoteAuthor ? { attribution: { name: quoteAuthor } } : {}),
    };
  }

  return { kind: "section", id, title, icon: sectionIconFor(title), body };
}

function isEmptyBody(body: ArticleBodyContent): boolean {
  return body.content.length === 0;
}

interface Assembled {
  sections: ArticleSectionModel[];
  sectionIds: string[];
}

function assemble<T>(
  cuts: Cut<T>[],
  toBody: (content: T[]) => ArticleBodyContent,
  quoteAuthorOf: (content: T[]) => string | undefined,
): Assembled {
  const [intro, ...rest] = cuts;
  const sectionIds = assignSectionIds(rest.map((cut) => cut.title ?? ""));
  const sections: ArticleSectionModel[] = [];
  const introBody = toBody(intro.content);

  if (!isEmptyBody(introBody)) {
    sections.push({ kind: "overview", id: ARTICLE_OVERVIEW_SECTION_ID, body: introBody });
  }

  rest.forEach((cut, index) => {
    sections.push(
      toSection(sectionIds[index], cut.title ?? "", toBody(cut.content), quoteAuthorOf(cut.content)),
    );
  });

  return { sections, sectionIds: sections.map((section) => section.id) };
}

function buildTocItems(
  sections: ArticleSectionModel[],
  outlineLevel: number | undefined,
  sectionLevel: number,
  headingsOf: (body: ArticleBodyContent, assignId: (text: string) => string | undefined) => VCodeHeading[],
): PublicTableOfContentsItem[] {
  if (outlineLevel === undefined) {
    return [];
  }

  if (outlineLevel === sectionLevel) {
    return sections.map((section) =>
      section.kind === "overview"
        ? { id: section.id, label: "Overview", icon: DEFAULT_SECTION_ICON }
        : { id: section.id, label: section.title, icon: section.icon },
    );
  }

  const assignId = createVCodeHeadingIdAssigner(sections.map((section) => section.id));

  return sections.flatMap((section) =>
    headingsOf(section.body, assignId)
      .filter((heading) => heading.level === outlineLevel)
      .map((heading) => ({ id: heading.id, label: heading.text, icon: "lucide:gauge" as IconName })),
  );
}

function headingsOfBody(
  body: ArticleBodyContent,
  assignId: (text: string) => string | undefined,
): VCodeHeading[] {
  return body.format === "markdown"
    ? extractMarkdownHeadings(body.content, assignId)
    : extractVCodeHeadings(body.content, assignId);
}

function buildVCodeArticleModel(content: VCodeContent): ArticleModel {
  const nodes = Array.isArray(content) ? content : [content];
  const headings = extractVCodeHeadings(nodes);
  const sectionLevel = findSectionLevel(headings);
  const { sections, sectionIds } = assemble(
    cutVCodeBody(nodes, sectionLevel),
    (raw) => ({ format: "vcode", content: trimVCodeCut(raw) }),
    firstQuoteAuthor,
  );

  return {
    sections,
    sectionIds,
    tocItems: buildTocItems(sections, findOutlineLevel(headings), sectionLevel, headingsOfBody),
  };
}

function collectMarkdownDefinitions(markdown: string): string {
  const definitions: string[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "definition") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        definitions.push(markdown.slice(start, end));
      }
    }
    if ("children" in node) {
      node.children.forEach(visit);
    }
  };
  visit(fromMarkdown(markdown));
  return definitions.join("\n");
}

function buildMarkdownArticleModel(markdown: string): ArticleModel {
  const headings = extractMarkdownHeadings(markdown);
  const sectionLevel = findSectionLevel(headings);
  const definitions = collectMarkdownDefinitions(markdown);
  const { sections, sectionIds } = assemble(
    cutMarkdownBody(markdown, sectionLevel),
    (lines) => {
      const content = lines.join("\n").trim();
      return {
        format: "markdown",
        content: content && definitions ? `${definitions}\n\n${content}` : content,
      };
    },
    () => undefined,
  );

  return {
    sections,
    sectionIds,
    tocItems: buildTocItems(sections, findOutlineLevel(headings), sectionLevel, headingsOfBody),
  };
}

export interface BuildArticleModelInput {
  body_raw: string;
  body_ast?: VCodeContent;
  bodyFormat?: "vcode" | "markdown";
}

export function buildEffectIndexArticleModel(article: BuildArticleModelInput): ArticleModel {
  if (article.bodyFormat === "markdown") {
    return buildMarkdownArticleModel(article.body_raw);
  }

  const content = normalizeVCodeContent(article.body_ast, article.body_raw);

  return content === undefined
    ? { sections: [], sectionIds: [], tocItems: [] }
    : buildVCodeArticleModel(content);
}
