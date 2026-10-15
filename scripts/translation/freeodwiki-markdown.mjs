import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize.ts";
import { INLINE_TAGS } from "./markup.mjs";

export function escapeProse(text) {
  return text.replace(/~/g, "\\~");
}

function stripCitationMarkers(text, counters) {
  let stripped = 0;
  const out = text
    .replace(/\[cite:[^\]]*\]/g, () => {
      stripped += 1;
      return "";
    })
    .replace(/\[citation-needed\]/g, () => {
      stripped += 1;
      return "";
    });
  if (counters && stripped > 0) counters.citationMarkersStripped += stripped;
  return out.replace(/[ \t]+([,.;:，。；：])/g, "$1").trim();
}

export function prose(text, counters) {
  if (typeof text !== "string") return "";
  return escapeProse(stripCitationMarkers(text, counters));
}

export function cell(text) {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, "<br>").trim();
}

function yamlString(value) {
  return JSON.stringify(String(value ?? "").replace(/\s+/g, " ").trim());
}

export function fileNameFor(title, fallback) {
  const base = String(title ?? "").replace(/[\\/:*?"<>|#]/g, "").replace(/\s+/g, " ").trim();
  const safe = base.replace(/^\.+/, "").trim();
  return `${safe.length > 0 ? safe : fallback}.md`;
}

export function linkSafe(fileName) {
  return fileName.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function externalHref(value) {
  const trimmed = String(value ?? "").trim().replace(/^\/+(?=https?:|mailto:)/i, "");
  if (trimmed.length === 0) return null;
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

export function firstSentence(text, limit = 88) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("，"), cut.lastIndexOf(". "));
  return `${stop > limit / 2 ? cut.slice(0, stop) : cut}…`;
}

function unitLabel(unit, labels) {
  return labels.UNIT_LABELS[String(unit ?? "").toLowerCase()] ?? String(unit ?? "");
}

export function routeLabel(route, labels) {
  const key = String(route ?? "").toLowerCase().replace(/\s+/g, "");
  return labels.ROUTE_LABELS[key] ?? String(route ?? "").trim();
}

export function formatRange(range, labels) {
  if (!range || typeof range !== "object") return "";
  const unit = unitLabel(range.unit, labels);
  const { min, max } = range;
  const suffix = unit ? ` ${unit}` : "";
  if (min != null && max != null) return min === max ? `${min}${suffix}` : `${min} - ${max}${suffix}`;
  if (min != null) return labels.ui.rangeAtLeast(`${min}${suffix}`);
  if (max != null) return labels.ui.rangeAtMost(`${max}${suffix}`);
  return "";
}

export function buildRegistry(pages, labels) {
  const registry = new Map();
  const add = (key, target) => {
    if (typeof key !== "string" || key.length === 0) return;
    if (!registry.has(key)) registry.set(key, target);
  };

  for (const page of pages) {
    const target = `/${page.tree}/${linkSafe(page.file)}`;
    const slug = page.slug;
    switch (page.kind) {
      case "substance":
        add(`/${slug}`, target);
        break;
      case "effect":
        add(`/effects${slug}`, target);
        add(`/effects/${slug}`, target);
        add(`/effect/${slug}`, target);
        add(`effects/${slug}`, target);
        add(slug, target);
        break;
      case "report":
        add(`/reports/${slug}`, target);
        break;
      case "summary":
        if (page.path) add(page.path, target);
        break;
      case "effectCategory":
        add(`/effects/category/${slug}`, target);
        break;
      case "article":
        add(`/articles/${slug}`, target);
        break;
      default:
        break;
    }
  }

  add("/", `/${labels.TREE.substance}/index.md`);
  add("/effects", `/${labels.TREE.effect}/index.md`);
  add("/reports", `/${labels.TREE.report}/index.md`);
  add("/articles", `/${labels.TREE.article}/index.md`);

  return registry;
}

export function resolveLink(target, ctx) {
  if (typeof target !== "string") return null;
  const trimmed = target.trim();
  if (trimmed.length === 0) return null;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;

  const bare = trimmed.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const resolved = ctx.registry.get(bare) ?? ctx.registry.get(bare.replace(/^\//, "")) ?? null;
  if (resolved && ctx.labels.DANGLING_TARGET_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
    ctx.counters.danglingTargetsBlocked += 1;
    return null;
  }
  return resolved;
}

function isNode(value) {
  return value != null && typeof value === "object" && typeof value.name === "string";
}

function asArray(content) {
  if (content == null) return [];
  return Array.isArray(content) ? content : [content];
}

function citationFor(key, ctx) {
  if (!ctx.citations) return null;
  return ctx.citations.get(String(key)) ?? null;
}

function citationMarker(node, ctx) {
  const key = node.properties?.to ?? node.properties?.no;
  const citation = citationFor(key, ctx);
  if (!citation) {
    ctx.counters.citationsDropped += 1;
    return "";
  }
  const number = ctx.citationOrder.get(citation.id) ?? ctx.citationOrder.size + 1;
  ctx.citationOrder.set(citation.id, number);
  return `[\\[${number}\\]](#${ctx.anchorPrefix}-${number})`;
}

function renderInline(content, ctx) {
  let out = "";
  for (const item of asArray(content)) {
    if (typeof item === "string") {
      out += escapeProse(item.replace(/\s*\n\s*/g, " "));
      continue;
    }
    if (!isNode(item)) continue;
    const properties = item.properties ?? {};
    switch (item.name) {
      case "b":
        out += `**${renderInline(item.children, ctx).trim()}**`;
        break;
      case "i":
        out += `*${renderInline(item.children, ctx).trim()}*`;
        break;
      case "u":
        out += `<u>${renderInline(item.children, ctx).trim()}</u>`;
        break;
      case "s":
        out += `~~${renderInline(item.children, ctx).trim()}~~`;
        break;
      case "sup":
        out += `<sup>${renderInline(item.children, ctx).trim()}</sup>`;
        break;
      case "br":
        out += "<br>";
        break;
      case "ref":
        out += citationMarker(item, ctx);
        break;
      case "ext-link": {
        const text = renderInline(item.children, ctx).trim();
        const href = externalHref(properties.to);
        out += href ? `[${text}](${href})` : text;
        break;
      }
      case "int-link": {
        const text = renderInline(item.children, ctx).trim();
        ctx.counters.internalLinksSeen += 1;
        const href = resolveLink(properties.to, ctx);
        if (href) {
          ctx.counters.internalLinksRewritten += 1;
          out += `[${text}](${href})`;
        } else {
          ctx.counters.internalLinksDropped += 1;
          out += text;
        }
        break;
      }
      default:
        out += renderInline(item.children, ctx);
        break;
    }
  }
  return out;
}

function isInline(item) {
  return typeof item === "string" || (isNode(item) && INLINE_TAGS.has(item.name));
}

function indentBlock(text, indent) {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join("\n");
}

function renderListItem(node, ctx, marker, depth) {
  const inline = [];
  const blocks = [];
  for (const child of asArray(node.children)) {
    if (isInline(child)) inline.push(child);
    else blocks.push(child);
  }
  const head = renderInline(inline, ctx).replace(/\s+/g, " ").trim();
  const lines = [`${marker} ${head}`.trimEnd()];
  const indent = " ".repeat(marker.length + 1);
  for (const block of renderBlocks(blocks, ctx, depth + 1)) {
    lines.push(indentBlock(block, indent));
  }
  return lines.join("\n");
}

function renderList(node, ctx, depth) {
  const ordered = node.name === "ol";
  const items = asArray(node.children).filter((child) => isNode(child) && child.name === "li");
  if (items.length === 0) return "";
  return items
    .map((item, index) => renderListItem(item, ctx, ordered ? `${index + 1}.` : "-", depth))
    .join("\n");
}

function renderCallout(title, bodyBlocks, ctx, depth) {
  const parts = [];
  if (title) parts.push(`**${escapeProse(title.trim())}**`);
  parts.push(...renderBlocks(bodyBlocks, ctx, depth + 1).filter(Boolean));
  if (parts.length === 0) return "";
  return parts
    .join("\n\n")
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

function headingHash(level, depth) {
  return "#".repeat(Math.min(6, level + 1 + Math.min(depth, 1)));
}

function renderBlocks(content, ctx, depth = 0) {
  const blocks = [];
  let run = [];

  const flush = () => {
    if (run.length === 0) return;
    const text = renderInline(run, ctx).replace(/[ \t]+/g, " ").trim();
    run = [];
    if (text.length > 0) blocks.push(text);
  };

  for (const item of asArray(content)) {
    if (isInline(item)) {
      run.push(item);
      continue;
    }
    if (!isNode(item)) continue;
    flush();
    const properties = item.properties ?? {};
    switch (item.name) {
      case "p":
        blocks.push(...renderBlocks(item.children, ctx, depth));
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4": {
        const text = renderInline(item.children, ctx).trim();
        if (text) blocks.push(`${headingHash(Number(item.name.slice(1)), depth)} ${text}`);
        break;
      }
      case "hr":
        blocks.push("---");
        break;
      case "ul":
      case "ol": {
        const list = renderList(item, ctx, depth);
        if (list) blocks.push(list);
        break;
      }
      case "li":
        blocks.push(renderListItem(item, ctx, "-", depth));
        break;
      case "quote": {
        const body = renderCallout(null, item.children, ctx, depth);
        if (body) blocks.push(body);
        const author = properties.author ? escapeProse(String(properties.author).trim()) : "";
        if (author) blocks.push(`> ${ctx.labels.ui.quotedFrom} ${author}`);
        break;
      }
      case "panel":
        blocks.push(renderCallout(properties.title, item.children, ctx, depth));
        break;
      case "headered-textbox": {
        const header = [properties.header, properties.subHeader].filter(Boolean).join("：");
        blocks.push(renderCallout(header, item.children, ctx, depth));
        break;
      }
      case "separated-textbox": {
        const halves = [properties.a, properties.b]
          .filter((half) => typeof half === "string" && half.trim().length > 0)
          .map((half) => escapeProse(half.trim()));
        const body = renderBlocks(item.children, ctx, depth + 1).filter(Boolean);
        const merged = [...halves, ...body].join("\n\n");
        if (merged) blocks.push(merged.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n"));
        break;
      }
      case "columns":
      case "column":
        blocks.push(...renderBlocks(item.children, ctx, depth));
        break;
      case "subarticle": {
        const body = renderBlocks(item.children, ctx, depth);
        const title = ctx.subarticleTitles?.get(String(properties.id)) ?? properties.id;
        if (title && !body[0]?.startsWith("#")) {
          blocks.push(`${headingHash(3, depth)} ${escapeProse(String(title))}`);
        }
        blocks.push(...body);
        break;
      }
      case "markdown": {
        const text = String(properties.text ?? "").trim();
        if (text) blocks.push(text);
        blocks.push(...renderBlocks(item.children, ctx, depth));
        break;
      }
      case "captioned-image":
      case "audio-player":
        ctx.counters.mediaDropped += 1;
        break;
      case "youtube-embed": {
        ctx.counters.mediaDropped += 1;
        break;
      }
      case "toc":
        break;
      default:
        blocks.push(...renderBlocks(item.children, ctx, depth));
        break;
    }
  }
  flush();
  return blocks.filter((block) => typeof block === "string" && block.trim().length > 0);
}

export function renderMarkupField(raw, ctx) {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  return renderBlocks(parseRawVCodeContent(stripCitationMarkers(raw, ctx.counters)), ctx);
}

export function renderPlainProse(text, ctx) {
  if (typeof text !== "string") return [];
  return String(text)
    .split(/\n{2,}/)
    .map((paragraph) => prose(paragraph.replace(/\n/g, " "), ctx.counters))
    .filter((paragraph) => paragraph.length > 0);
}

function frontMatter(title, description) {
  return ["---", `title: ${yamlString(title)}`, `description: ${yamlString(description)}`, "---"].join("\n");
}


export function sourceStatement({ title, url, licence, translation, generatedAt, labels }) {
  const date = String(generatedAt ?? "").slice(0, 10);
  const ui = labels.ui;
  return [
    "---",
    "",
    `> **${ui.sourceHeading}**`,
    ">",
    `> ${ui.sourceLine(title, url)}`,
    `> ${ui.licenceLine(licence, translation ?? ui.defaultTranslationLine)}`,
    `> ${ui.snapshotLine(date)}`,
  ].join("\n");
}

export function assemble({ tree, file, title, description, blocks, source, labels }) {
  const body = blocks.filter((block) => typeof block === "string" && block.trim().length > 0).join("\n\n");
  return {
    tree,
    file,
    text: `${frontMatter(title, description)}\n\n# ${title}\n\n[${labels.ui.back}](index.md)\n\n${body}\n\n${source}\n`,
  };
}
