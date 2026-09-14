/**
 * Converts the legacy `[markdown text="…"]` blobs in an Effect Index article
 * body into the VCode markup the rest of the corpus uses.
 *
 * Shape of the damage (see the script header for why it never rendered):
 *
 *   [int-link to="/effectsafter-images"]markdown text="#### Sensory* [**After
 *   images**[/int-link] <sup>(common)</sup>* [int-link to="…"]**Auditory
 *   suppression**[/int-link] <sup>(common)</sup>… " /]
 *
 * The importer hoisted the first item's `[int-link]` opening tag in front of
 * the blob, so the blob's own first `[**` is that link's label. Everything
 * after it is already well formed VCode wrapped in markdown bullets.
 */

const BLOB_OPENER = 'markdown text="';
const BLOB_CLOSER = '" /]';

/** `[int-link to="…"]**Label**[/int-link] <sup>(frequency)</sup>` */
const EFFECT_ITEM =
  /\[int-link to="([^"]+)"\]\*\*(.+?)\*\*\[\/int-link\](?:\s*<sup>\((.*?)\)<\/sup>)?/g;

/** Panel icons, matching the titles already used by `dmt` and the scales. */
const PANEL_ICONS = new Map([
  ["Sensory", "eye.svg"],
  ["Visual", "eye.svg"],
  ["Cognitive", "user.svg"],
  ["Physical", "child.svg"],
  ["Other", "cogs.svg"],
]);

const FALLBACK_PANEL_TITLE = "Other";
const COLUMNS_PER_ROW = 3;

/** Locates every blob, including the `[int-link]` opening the importer hoisted. */
function findBlobs(body) {
  const blobs = [];
  let cursor = 0;

  for (;;) {
    const opener = body.indexOf(BLOB_OPENER, cursor);
    if (opener === -1) break;

    const closer = body.indexOf(BLOB_CLOSER, opener);
    if (closer === -1) {
      throw new Error(`Unterminated markdown shortcode at offset ${opener}.`);
    }

    let start = opener - 1;
    let hoistedLink = null;
    if (body[opener - 1] === "]") {
      const before = body.slice(0, opener);
      const match = /\[int-link to="([^"]+)"\]$/.exec(before);
      if (!match) {
        throw new Error(`Unrecognised markdown shortcode prefix at offset ${opener}.`);
      }
      hoistedLink = match[1];
      start = match.index;
    } else if (body[opener - 1] !== "[") {
      throw new Error(`Unrecognised markdown shortcode prefix at offset ${opener}.`);
    }

    blobs.push({
      start,
      end: closer + BLOB_CLOSER.length,
      text: repairHoistedLink(body.slice(opener + BLOB_OPENER.length, closer), hoistedLink),
    });
    cursor = closer + BLOB_CLOSER.length;
  }

  return blobs;
}

/** Restores the first item's opening tag inside the blob it was hoisted out of. */
function repairHoistedLink(text, hoistedLink) {
  return hoistedLink ? text.replace("[**", `[int-link to="${hoistedLink}"]**`) : text;
}

/** Adjacent blobs are one logical block: `#### Sensory`, `#### Cognitive`, … */
function mergeAdjacent(blobs) {
  const merged = [];
  for (const blob of blobs) {
    const previous = merged[merged.length - 1];
    if (previous && previous.end === blob.start) {
      previous.end = blob.end;
      previous.text = `${previous.text}\n${blob.text}`;
      previous.count += 1;
    } else {
      merged.push({ ...blob, count: 1 });
    }
  }
  return merged;
}

/** Splits a blob on its markdown headings; an unheaded lead keeps `title: null`. */
function splitSections(text) {
  const sections = [];
  // The blobs are one long line, so a heading is not anchored to a line start.
  const pattern = /(#{3,4})\s*([^\n*[]+)/g;
  let lastIndex = 0;
  let pending = null;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const body = text.slice(lastIndex, match.index);
    if (pending) {
      sections.push({ ...pending, body });
    } else if (body.trim()) {
      sections.push({ title: null, level: 0, body });
    }
    pending = { title: match[2].trim(), level: match[1].length };
    lastIndex = pattern.lastIndex;
  }

  const tail = text.slice(lastIndex);
  if (pending) {
    sections.push({ ...pending, body: tail });
  } else if (tail.trim()) {
    sections.push({ title: null, level: 0, body: tail });
  }

  return sections;
}

function readEffectItems(body) {
  EFFECT_ITEM.lastIndex = 0;
  const items = [];
  for (let match = EFFECT_ITEM.exec(body); match; match = EFFECT_ITEM.exec(body)) {
    items.push({ to: match[1], label: match[2], frequency: match[3] ?? null });
  }
  return items;
}

/** True when the section is nothing but effect links, i.e. a roundup panel. */
function isEffectRoundup(body, items) {
  if (items.length === 0) return false;
  EFFECT_ITEM.lastIndex = 0;
  const remainder = body
    .replace(EFFECT_ITEM, "")
    .replace(/[*\-\s]/g, "");
  return remainder === "";
}

function renderEffectRow(item) {
  const frequency = item.frequency ? ` [sup](${item.frequency})[/sup]` : "";
  return `[li][b][int-link to="${item.to}"]${item.label}[/int-link][/b]${frequency}[/li]`;
}

function renderPanel(title, items) {
  const rows = [];
  let nested = false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const previous = items[index - 1];
    // Consecutive variations share one sub-list beneath their parent effect.
    const nests = item.to.includes("?s=") && previous &&
      previous.to.split("?")[0] === item.to.split("?")[0];
    if (nested && !nests) rows.push("[/ul]");
    if (!nested && nests) rows.push("[ul]");
    rows.push(renderEffectRow(item));
    nested = Boolean(nests);
  }
  if (nested) rows.push("[/ul]");
  const icon = PANEL_ICONS.get(title) ?? "cogs.svg";
  return `[panel title="${title}" icon="${icon}"]\n[ul]\n${rows.join("\n")}\n[/ul]\n[/panel]`;
}

function renderColumns(panels) {
  const rows = [];
  for (let index = 0; index < panels.length; index += COLUMNS_PER_ROW) {
    const group = panels.slice(index, index + COLUMNS_PER_ROW);
    const filled = group.map((panel) => `[column]\n${panel}\n[/column]`);
    while (filled.length < COLUMNS_PER_ROW) filled.push("[column]\n[/column]");
    rows.push(`[columns]\n${filled.join("\n")}\n[/columns]`);
  }
  return rows.join("\n\n");
}

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** `**bold**`, `*italic*`, and `[text](url)` become their VCode equivalents. */
function convertInlineMarkdown(text) {
  return text
    .replace(MARKDOWN_LINK, '[ext-link to="$2"]$1[/ext-link]')
    .replace(/\*\*(.+?)\*\*/g, "[b]$1[/b]")
    .replace(/(^|[^*])\*([^*]+?)\*/g, "$1[i]$2[/i]")
    .replace(/<sup>\((.*?)\)<\/sup>/g, "[sup]($1)[/sup]")
    .trim();
}

const BULLET = /(?:^|\n|(?<=\[\/int-link\])|(?<=\)<\/sup>))\s*[*-]\s+(?=\S)/;

/**
 * Separates a bulleted list from any prose that introduces it, so a lead-in
 * label such as `**Secular meditative techniques**` stays a paragraph instead
 * of becoming the list's first row.
 */
function splitBullets(body) {
  const entries = body
    .split(new RegExp(BULLET, "g"))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const leads = /^\s*[*-]\s+\S/.test(body) ? 0 : 1;
  return { lead: entries.slice(0, leads).join(" "), items: entries.slice(leads) };
}

/** A bulleted list that is not an effect roundup, such as the report list. */
function renderPlainList(body) {
  const { lead, items } = splitBullets(body);
  const rows = items.map((entry) => `[li]${convertInlineMarkdown(entry)}[/li]`).join("\n");
  const list = `[ul]\n${rows}\n[/ul]`;
  return lead ? `[p]${convertInlineMarkdown(lead)}[/p]\n\n${list}` : list;
}

/** `**Total :** 8 - 12 hours*` rows, the duration block's markdown shape. */
function renderDefinitionList(body) {
  const rows = body
    .split("\n")
    .map((line) => line.replace(/\*\s*$/, "").trim())
    .filter(Boolean)
    .map((line) => `[li]${convertInlineMarkdown(line)}[/li]`)
    .join("\n");
  return `[ul]\n${rows}\n[/ul]`;
}

/**
 * Categories the article itself assigns, so an unheaded roundup can be grouped
 * without inventing a taxonomy: an effect keeps whatever heading it sits under
 * elsewhere in the same article.
 */
function buildCategoryIndex(blocks) {
  const index = new Map();
  for (const sections of blocks) {
    for (const section of sections) {
      if (!section.title || !section.items) continue;
      for (const item of section.items) {
        const key = item.to.split("?")[0];
        if (!index.has(key)) index.set(key, section.title);
      }
    }
  }
  return index;
}

function groupByCategory(items, categoryIndex) {
  const groups = new Map();
  for (const item of items) {
    const title = categoryIndex.get(item.to.split("?")[0]) ?? FALLBACK_PANEL_TITLE;
    const existing = groups.get(title);
    if (existing) existing.push(item);
    else groups.set(title, [item]);
  }
  return groups;
}

/**
 * Rewrites every `[markdown text="…"]` blob in `body`.
 *
 * Returns the repaired body plus counts for the caller's dry-run report.
 */
export function repairMarkdownShortcodeBody(body) {
  const blobs = mergeAdjacent(findBlobs(body));
  const parsed = blobs.map((blob) => ({
    blob,
    sections: splitSections(blob.text).map((section) => {
      const items = readEffectItems(section.body);
      return isEffectRoundup(section.body, items) ? { ...section, items } : section;
    }),
  }));

  const categoryIndex = buildCategoryIndex(parsed.map((entry) => entry.sections));

  let output = "";
  let cursor = 0;
  let panelCount = 0;

  for (const { blob, sections } of parsed) {
    const rendered = [];
    // Panels from one blob share a `[columns]` row, the way the hand-written
    // articles lay a level's Sensory/Cognitive/Physical roundups side by side.
    let pending = [];
    const flush = () => {
      if (pending.length === 0) return;
      rendered.push(renderColumns(pending));
      pending = [];
    };

    for (const section of sections) {
      if (section.items) {
        const groups = section.title
          ? new Map([[section.title, section.items]])
          : groupByCategory(section.items, categoryIndex);
        for (const [title, items] of groups) {
          pending.push(renderPanel(title, items));
          panelCount += 1;
        }
        continue;
      }

      flush();

      const { items } = splitBullets(section.body);
      const listing =
        items.length > 1
          ? renderPlainList(section.body)
          : section.body.includes("\n")
            ? renderDefinitionList(section.body)
            : null;

      if (section.title) {
        const level = Math.min(section.level, 4);
        rendered.push(`[h${level}]${section.title}[/h${level}]`);
      }
      if (listing) {
        rendered.push(listing);
      } else if (section.body.trim()) {
        rendered.push(`[p]${convertInlineMarkdown(section.body)}[/p]`);
      }
    }

    flush();
    output += body.slice(cursor, blob.start) + rendered.join("\n\n");
    cursor = blob.end;
  }

  output += body.slice(cursor);

  if (output.includes(BLOB_OPENER)) {
    throw new Error("Repair left a markdown shortcode behind.");
  }

  return { body: output, blobs: blobs.length, panels: panelCount };
}


