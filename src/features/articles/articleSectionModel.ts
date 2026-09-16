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

/**
 * Section model for an Effect Index article, the twin of
 * `effects/articleSectionModel`.
 *
 * An effect article arrives from Postgres already split into fields (overview,
 * analysis, commentary, ...) and the page maps each to a section. An Effect
 * Index article is one flat body, so the split happens here: the body is cut
 * at the level its author wrote sections at, and each cut becomes the same
 * kind of section the effect page renders, with the same chrome. Personal
 * commentary is recognised by its heading and gets the effect page's speech
 * bubble and attribution rather than a plain prose section.
 */

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
  /** The quote's own author, when the commentary was written as a `[quote]`. */
  attribution?: ArticleCommentaryAttribution;
}

export type ArticleSectionModel =
  | ArticleOverviewSectionModel
  | ArticleProseSectionModel
  | ArticleCommentarySectionModel;

export interface ArticleModel {
  sections: ArticleSectionModel[];
  tocItems: PublicTableOfContentsItem[];
  /**
   * Reserve these when creating the renderer's heading-id assigner, exactly as
   * the effect page does with its section ids: a body heading that slugs to a
   * section's id takes a suffix instead of duplicating the wrapper's DOM id.
   */
  sectionIds: string[];
}

export const ARTICLE_OVERVIEW_SECTION_ID = "overview";
const COMMENTARY_ICON: IconName = "lucide:quote";
const DEFAULT_SECTION_ICON: IconName = icons.bookOpenText;

/**
 * Section glyphs for the headings the archive actually uses. Anything else
 * carries the article glyph; a wrong guess would mislabel, a repeated generic
 * glyph only fails to add.
 */
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

/** One destination is not a table of contents; it is a restatement. */
const TOC_MIN_ITEMS = 2;
/** The default when a body has no headings at all to read a level off. */
const DEFAULT_SECTION_LEVEL = 2;
/** Titled blocks rank below every real heading; see `headings.ts`. */
const DEEPEST_REAL_HEADING_LEVEL = 4;

function sectionIconFor(title: string): IconName {
  return SECTION_ICONS_BY_TITLE.find((entry) => entry.match.test(title))?.icon ?? DEFAULT_SECTION_ICON;
}

/**
 * The level the body writes its sections at, which is not always h2:
 * `meditation` is outlined entirely at h3, and the intensity scales carry one
 * trailing h2 above a stack of level cards. Only real heading levels count.
 */
function findSectionLevel(headings: VCodeHeading[]): number {
  const realLevels = headings
    .map((heading) => heading.level)
    .filter((level) => level <= DEEPEST_REAL_HEADING_LEVEL);

  return realLevels.length > 0 ? Math.min(...realLevels) : DEFAULT_SECTION_LEVEL;
}

/**
 * The level the contents rail lists: the shallowest with enough entries to
 * form an outline. For the intensity scales that is the level cards, not the
 * single trailing "See Also"; for a body outlined at its section level it is
 * the sections themselves.
 */
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

/**
 * Split top-level nodes at headings of the section level. A heading may be an
 * `h*` node or a `markdown` node whose text opens with the heading line, which
 * is how `meditation` writes its sections; any text after that line stays in
 * the section as a markdown node of its own.
 */
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

/** Effect Index sets an `[hr]` before every heading; a section supplies its own. */
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

/** A section title's own slug, or a positional id when the title slugs to nothing. */
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
      // The bubble supplies the quote chrome, so the commentary's own `[quote]`
      // unwraps to its prose - the same step the effect model takes.
      body:
        body.format === "vcode"
          ? { format: "vcode", content: unwrapTopLevelQuotes(body.content) }
          : body,
      ...(quoteAuthor ? { attribution: { name: quoteAuthor } } : {}),
    };
  }

  return { kind: "section", id, title, icon: sectionIconFor(title), body };
}

/** Both formats hold a length: nodes for VCode, characters for Markdown. */
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

  // The overview has no heading, so with no prose it is nothing. A titled
  // section is a section whatever follows its heading.
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

/**
 * Contents rail entries, in the effect page's shape: an Overview entry for the
 * lead prose, then each section under its own glyph. When the outline sits
 * deeper than the sections (the scales' level cards) the rail lists those
 * headings instead, with ids from an assigner reserved on the section ids so
 * they match what the page's renderers emit.
 */
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

/**
 * Two body languages share the article route. Legacy rows carry VCode, in
 * `body_ast` when the read model parsed it and otherwise as markup in
 * `body_raw`; rows written in the Writing tab carry plain Markdown.
 */
export function buildEffectIndexArticleModel(article: BuildArticleModelInput): ArticleModel {
  if (article.bodyFormat === "markdown") {
    return buildMarkdownArticleModel(article.body_raw);
  }

  const content = normalizeVCodeContent(article.body_ast, article.body_raw);

  return content === undefined
    ? { sections: [], sectionIds: [], tocItems: [] }
    : buildVCodeArticleModel(content);
}
