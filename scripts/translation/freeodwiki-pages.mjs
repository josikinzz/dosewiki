/**
 * One FreeODwiki page per dose.wiki record. Each builder takes a translated
 * item plus the run context and returns the file to write; the tables and
 * sections it lays out follow their existing drug pages, so a reader moving
 * between an upstream page and one of these sees the same shape.
 */

import { SITE } from "./freeodwiki-shape.mjs";
import {
  assemble,
  cell,
  escapeProse,
  fileNameFor,
  firstSentence,
  formatRange,
  prose,
  renderMarkupField,
  renderPlainProse,
  resolveLink,
  routeLabel,
  sourceStatement,
} from "./freeodwiki-markdown.mjs";

// ----------------------------------------------------------------- page bodies

function substanceTables(item, ctx) {
  const { ui, DOSE_TIERS, DURATION_STAGES } = ctx.labels;
  const blocks = [];
  const routes = Array.isArray(item.dosage?.routes) ? item.dosage.routes : [];
  for (const route of routes) {
    const ranges = route?.dose_ranges;
    if (!ranges) continue;
    const rows = DOSE_TIERS.map(([key, label]) => [label, formatRange(ranges[key], ctx.labels)]).filter(([, value]) => value);
    if (rows.length === 0) continue;
    blocks.push(`#### ${ui.withRoute(ui.doseGuide, routeLabel(route.route, ctx.labels) || ui.routeUnknown)}`);
    blocks.push([
      ui.doseHeader,
      "| --- | --- |",
      ...rows.map(([label, value]) => `| ${label} | ${cell(escapeProse(value))} |`),
    ].join("\n"));
    const notes = prose(route.notes, ctx.counters);
    if (notes) blocks.push(`> ${cell(notes)}`);
  }

  const durations = Array.isArray(item.duration?.routes) ? item.duration.routes : [];
  for (const route of durations) {
    const stages = route?.stages;
    if (!stages) continue;
    const rows = DURATION_STAGES.map(([key, label]) => [label, formatRange(stages[key], ctx.labels)]).filter(([, value]) => value);
    if (rows.length === 0) continue;
    blocks.push(`#### ${ui.withRoute(ui.durationGuide, routeLabel(route.route, ctx.labels) || ui.routeUnknown)}`);
    blocks.push([
      ui.durationHeader,
      "| --- | --- |",
      ...rows.map(([label, value]) => `| ${label} | ${cell(escapeProse(value))} |`),
    ].join("\n"));
  }
  return blocks;
}

function substanceEffects(item, ctx) {
  const effects = item.subjective_effects;
  if (!effects || typeof effects !== "object") return [];
  const { ui, groupLabel } = ctx.labels;
  const blocks = [];
  const groupBlocks = (groups, level) => {
    for (const [group, value] of Object.entries(groups ?? {})) {
      const list = Array.isArray(value?.effects) ? value.effects : [];
      if (list.length === 0) continue;
      const heading = groupLabel(group);
      if (heading) blocks.push(`${"#".repeat(level)} ${escapeProse(heading)}`);
      blocks.push(list
        .map((effect) => {
          const name = prose(effect?.name, ctx.counters);
          if (!name) return null;
          const description = prose(effect?.description, ctx.counters);
          // The index stores an effect's display name, not its slug, so the
          // only sound target is an effect page whose title is exactly this.
          const href = ctx.effectPagesByTitle?.get(name) ?? null;
          if (href) ctx.counters.effectNamesLinked += 1;
          const label = href ? `[${name}](${href})` : name;
          return `- ${label}${description ? `${ui.colon}${description}` : ""}`;
        })
        .filter(Boolean)
        .join("\n"));
    }
  };

  for (const [key, label] of [["physical", ui.physicalEffects], ["cognitive", ui.cognitiveEffects]]) {
    if (!effects[key]) continue;
    blocks.push(`### ${label}`);
    const note = prose(effects.notes?.[key], ctx.counters);
    if (note) blocks.push(note);
    groupBlocks(effects[key], 4);
  }

  if (effects.sensory && typeof effects.sensory === "object") {
    blocks.push(`### ${ui.sensoryEffects}`);
    const note = prose(effects.notes?.sensory, ctx.counters);
    if (note) blocks.push(note);
    for (const [modality, value] of Object.entries(effects.sensory)) {
      const subcategories = value?.subcategories;
      if (!subcategories || Object.keys(subcategories).length === 0) continue;
      blocks.push(`#### ${escapeProse(groupLabel(modality) ?? modality)}`);
      const modalityNote = prose(value?.note, ctx.counters);
      if (modalityNote) blocks.push(modalityNote);
      groupBlocks(subcategories, 5);
    }
  }

  const attribution = effects.attribution;
  if (attribution?.text) {
    const text = prose(attribution.text, ctx.counters);
    const url = String(attribution.url ?? "").trim();
    blocks.push(`> ${cell(text)}${url ? ` <${url}>` : ""}`);
  }
  return blocks;
}

/** `{ start, end }` from the history schema, or a plain string; anything else renders no range. */
function formatDateRange(range) {
  if (!range) return "";
  if (typeof range === "string") return range.trim();
  if (typeof range !== "object") return "";
  const start = String(range.start ?? "").trim();
  const end = String(range.end ?? "").trim();
  if (start && end) return start === end ? start : `${start}–${end}`;
  return start || end;
}

function substanceHarm(item, ctx) {
  const harm = item.harm_potential;
  if (!harm || typeof harm !== "object") return [];
  const { ui } = ctx.labels;
  const blocks = [];
  const walk = (value, label, level) => {
    if (value == null) return;
    if (typeof value === "string") {
      const text = prose(value, ctx.counters);
      if (text) blocks.push(`**${escapeProse(label)}**${ui.colon}${text}`);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, label, level);
      return;
    }
    if (typeof value !== "object") return;
    const description = prose(value.description, ctx.counters);
    if (description) {
      blocks.push(`#### ${escapeProse(label)}`);
      blocks.push(description);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "description" || key === "level") continue;
      walk(child, `${label} · ${ui.harmSub[key] ?? key}`, level + 1);
    }
  };
  for (const [key, label] of Object.entries(ui.harm)) {
    if (harm[key]) walk(harm[key], label, 0);
  }
  return blocks;
}

function substanceLegality(item, ctx) {
  const legality = item.legality;
  if (!legality || typeof legality !== "object") return [];
  const { ui, STATUS_LABELS } = ctx.labels;
  const blocks = [];
  const international = Array.isArray(legality.international) ? legality.international : [];
  if (international.length > 0) {
    blocks.push(`### ${ui.internationalConventions}`);
    blocks.push(international.map((entry) => `- ${prose(String(entry), ctx.counters)}`).join("\n"));
  }
  const countries = legality.countries && typeof legality.countries === "object" ? legality.countries : {};
  const names = Object.keys(countries).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return blocks;

  blocks.push(`### ${ui.legalStatusByCountry}`);
  blocks.push([
    ui.legalityHeader,
    "| --- | --- | --- | --- |",
    ...names.map((name) => {
      const row = countries[name] ?? {};
      const status = STATUS_LABELS[String(row.canonicalStatus ?? "").toLowerCase()]
        ?? prose(row.status, ctx.counters)
        ?? "";
      return `| ${cell(escapeProse(name))} | ${cell(status)} | ${cell(prose(row.designation, ctx.counters))} | ${cell(prose(row.instrument, ctx.counters))} |`;
    }),
  ].join("\n"));

  const notes = names
    .map((name) => {
      const note = prose(countries[name]?.notes, ctx.counters);
      return note ? `- **${escapeProse(name)}**${ui.colon}${note.replace(/\n+/g, " ")}` : null;
    })
    .filter(Boolean);
  if (notes.length > 0) {
    blocks.push(`#### ${ui.countryNotes}`);
    blocks.push(notes.join("\n"));
  }
  return blocks;
}

export function substancePage(item, ctx) {
  const { ui, INTERACTION_TIERS, LICENCE, TREE } = ctx.labels;
  const title = String(item.title ?? item.slug);
  const blocks = [];

  // The drug-class safety banners the site shows above the hero. Same rule as
  // everywhere else: enabled on this named slug, never inferred from a class.
  // A blockquote, for the reason `sourceStatement` gives: the target's enabled
  // Markdown extension set cannot be asserted, and a blockquote survives all
  // of them.
  for (const banner of ctx.bannersFor?.(String(item.slug ?? "")) ?? []) {
    blocks.push([
      `> **${escapeProse(banner.severityLabel)} — ${escapeProse(banner.headline)}**`,
      ">",
      ...banner.points.map((point) => `> ${escapeProse(point)}`),
    ].join("\n"));
  }

  const summary = renderPlainProse(item.summary, ctx);
  blocks.push(...summary);
  blocks.push(...substanceTables(item, ctx));

  const sections = [
    [ui.pharmacology, () => {
      const out = [];
      for (const key of ["pharmacodynamics", "pharmacokinetics"]) {
        out.push(...renderPlainProse(item.pharmacology?.[key], ctx));
      }
      const sites = Array.isArray(item.pharmacology?.binding_sites) ? item.pharmacology.binding_sites : [];
      if (sites.length > 0) {
        out.push([
          ui.bindingHeader,
          "| --- | --- | --- |",
          ...sites.map((site) => `| ${cell(escapeProse(String(site?.target ?? "")))} | ${cell(prose(site?.efficacy, ctx.counters))} | ${cell(prose(site?.affinity, ctx.counters))} |`),
        ].join("\n"));
      }
      return out;
    }],
    [ui.subjectiveEffects, () => substanceEffects(item, ctx)],
    [ui.tolerance, () => {
      const tolerance = item.tolerance ?? {};
      const rows = [
        [ui.baselineTolerance, tolerance.baseline_tolerance],
        [ui.fullTolerance, tolerance.full_tolerance],
        [ui.halfTolerance, tolerance.half_tolerance],
      ]
        .map(([label, value]) => [label, prose(value, ctx.counters)])
        .filter(([, value]) => value);
      const out = rows.map(([label, value]) => `**${label}**${ui.colon}${value}`);
      const cross = Array.isArray(tolerance.cross_tolerance) ? tolerance.cross_tolerance : [];
      if (cross.length > 0) {
        out.push(`**${ui.crossTolerance}**${ui.colon}${cross.map((entry) => prose(String(entry), ctx.counters)).filter(Boolean).join(ui.listSeparator)}`);
      }
      return out;
    }],
    [ui.harmPotential, () => substanceHarm(item, ctx)],
    [ui.interactions, () => {
      // Combination lists in the site's own severity order; each entry is a
      // free-text line that may carry its own explanation in parentheses.
      const interactions = item.interactions ?? {};
      const out = [];
      for (const [key, label] of INTERACTION_TIERS) {
        const entries = Array.isArray(interactions[key]) ? interactions[key] : [];
        if (entries.length === 0) continue;
        out.push(`### ${label}`);
        out.push(entries.map((entry) => `- ${prose(String(entry), ctx.counters)}`).filter((line) => line !== "- ").join("\n"));
      }
      return out;
    }],
    [ui.historyCulture, () => {
      const out = renderPlainProse(item.history_culture?.content, ctx);
      const sections = Array.isArray(item.history_culture?.sections) ? item.history_culture.sections : [];
      for (const section of sections) {
        const heading = prose(section?.heading, ctx.counters);
        const dateRange = formatDateRange(section?.date_range);
        if (heading) out.push(`### ${dateRange ? ui.withRoute(heading, escapeProse(dateRange)) : heading}`);
        out.push(...renderPlainProse(section?.content, ctx));
        for (const sub of Array.isArray(section?.subsections) ? section.subsections : []) {
          const subHeading = prose(sub?.heading, ctx.counters);
          if (subHeading) out.push(`#### ${subHeading}`);
          out.push(...renderPlainProse(sub?.content, ctx));
        }
      }
      return out;
    }],
    [ui.legality, () => substanceLegality(item, ctx)],
  ];

  for (const [heading, build] of sections) {
    const body = build().filter(Boolean);
    if (body.length === 0) continue;
    blocks.push(`## ${heading}`);
    blocks.push(...body);
  }

  const licence = LICENCE.substances;

  return assemble({
    tree: TREE.substance,
    file: fileNameFor(title, item.slug),
    title,
    description: firstSentence(summary[0] ?? title),
    blocks,
    source: sourceStatement({
      tree: TREE.substance,
      title,
      url: `${SITE}/${item.slug}`,
      licence: licence.statement,
      generatedAt: ctx.generatedAt,
      labels: ctx.labels,
    }),
    labels: ctx.labels,
  });
}

export function effectPage(item, ctx) {
  const { ui, LICENCE, TREE } = ctx.labels;
  const title = String(item.name ?? item.slug);
  const blocks = [];
  const description = renderMarkupField(item.description_raw, ctx);
  // The card summary restates the opening of the description on most effects.
  // It still earns its place in the front matter, but not twice in the body.
  blocks.push(...(description.length > 0 ? description : renderPlainProse(item.summary, ctx)));

  for (const [field, heading] of [
    ["long_summary_raw", ui.longSummary],
    ["style_variations_raw", ui.styleVariations],
    ["analysis_raw", ui.analysis],
    ["personal_commentary_raw", ui.personalCommentary],
  ]) {
    const body = renderMarkupField(item[field], ctx);
    if (body.length === 0) continue;
    blocks.push(`## ${heading}`);
    blocks.push(...body);
  }

  const seeAlso = (Array.isArray(item.see_also) ? item.see_also : [])
    .map((entry) => {
      const label = prose(entry?.title, ctx.counters);
      if (!label) return null;
      ctx.counters.internalLinksSeen += 1;
      const href = resolveLink(entry?.location, ctx);
      if (href) {
        ctx.counters.internalLinksRewritten += 1;
        return `- [${label}](${href})`;
      }
      ctx.counters.internalLinksDropped += 1;
      return `- ${label}`;
    })
    .filter(Boolean);
  if (seeAlso.length > 0) {
    blocks.push(`## ${ui.seeAlso}`);
    blocks.push(seeAlso.join("\n"));
  }

  const external = (Array.isArray(item.external_links) ? item.external_links : [])
    .map((entry) => {
      const label = prose(entry?.title, ctx.counters);
      const url = String(entry?.url ?? "").trim();
      return label && url ? `- [${label}](${url})` : null;
    })
    .filter(Boolean);
  if (external.length > 0) {
    blocks.push(`## ${ui.externalLinks}`);
    blocks.push(external.join("\n"));
  }

  blocks.push(...citationList(ctx));

  const licence = LICENCE.effects;
  return assemble({
    tree: TREE.effect,
    file: fileNameFor(title, item.slug),
    title,
    description: firstSentence(prose(item.summary, ctx.counters) || title),
    blocks,
    source: sourceStatement({
      tree: TREE.effect,
      title,
      url: `${SITE}/effects/${item.slug}`,
      licence: licence.statement,
      generatedAt: ctx.generatedAt,
      labels: ctx.labels,
    }),
    labels: ctx.labels,
  });
}

export function articlePage(item, ctx) {
  const { LICENCE, TREE } = ctx.labels;
  const title = String(item.title ?? item.slug);
  const blocks = [];
  const lede = prose(item.shortDescription, ctx.counters);
  if (lede) blocks.push(`*${lede}*`);
  blocks.push(...renderMarkupField(item.body_raw, ctx));
  blocks.push(...citationList(ctx));

  return assemble({
    tree: TREE.article,
    file: fileNameFor(title, item.slug),
    title,
    description: firstSentence(lede || blocks.find((block) => !block.startsWith("#")) || title),
    blocks,
    source: sourceStatement({
      tree: TREE.article,
      title,
      url: `${SITE}/articles/${item.slug}`,
      licence: LICENCE.articles.statement,
      generatedAt: ctx.generatedAt,
      labels: ctx.labels,
    }),
    labels: ctx.labels,
  });
}

/**
 * A psychoactive summary: its own intro and section definitions, then each
 * section's effects as links into the effect pages, whose long summaries the
 * live page inlines. The effect pages carry that prose here, so the summary
 * stays a guide rather than a second copy of the index.
 */
export function summaryPage(item, ctx) {
  const { ui, LICENCE, TREE } = ctx.labels;
  const title = String(item.title ?? item.slug);
  const blocks = [];
  for (const paragraph of Array.isArray(item.intro) ? item.intro : []) {
    const text = prose(paragraph?.text, ctx.counters);
    if (!text) continue;
    blocks.push(paragraph?.italic ? `*${text}*` : text);
  }
  if (item.image?.title && item.image?.artist) {
    blocks.push(`> ${ui.artworkCredit(escapeProse(String(item.image.title)), escapeProse(String(item.image.artist)))}`);
  }
  for (const section of Array.isArray(item.sections) ? item.sections : []) {
    const heading = prose(section?.title, ctx.counters);
    if (!heading) continue;
    blocks.push(`## ${heading}`);
    const definition = prose(section?.definition, ctx.counters);
    if (definition) blocks.push(definition);
    const links = (Array.isArray(section?.effectSlugs) ? section.effectSlugs : [])
      .map((slug) => {
        const page = ctx.effectPagesBySlug?.get(String(slug));
        if (!page) return null;
        ctx.counters.effectNamesLinked += 1;
        return `- [${escapeProse(page.title)}](${page.href})`;
      })
      .filter(Boolean);
    if (links.length > 0) {
      blocks.push(ui.summaryEffectsIntro);
      blocks.push(links.join("\n"));
    }
  }
  const seeAlso = (Array.isArray(item.seeAlso) ? item.seeAlso : [])
    .map((entry) => {
      const label = prose(entry?.label, ctx.counters);
      if (!label) return null;
      ctx.counters.internalLinksSeen += 1;
      const href = resolveLink(entry?.href, ctx);
      if (href) {
        ctx.counters.internalLinksRewritten += 1;
        return `- [${label}](${href})`;
      }
      ctx.counters.internalLinksDropped += 1;
      return `- ${label}`;
    })
    .filter(Boolean);
  if (seeAlso.length > 0) {
    blocks.push(`## ${ui.seeAlso}`);
    blocks.push(seeAlso.join("\n"));
  }

  return assemble({
    tree: TREE.article,
    file: fileNameFor(title, item.slug),
    title,
    description: firstSentence(prose(item.metadataDescription, ctx.counters) || title),
    blocks,
    source: sourceStatement({
      tree: TREE.article,
      title,
      url: `${SITE}${item.path}`,
      licence: LICENCE.summaries.statement,
      generatedAt: ctx.generatedAt,
      labels: ctx.labels,
    }),
    labels: ctx.labels,
  });
}

/** An effect category: its definition and the effects it contains, linked. */
export function effectCategoryPage(item, ctx) {
  const { ui, LICENCE, TREE } = ctx.labels;
  const title = String(item.name ?? item.slug);
  const blocks = [...renderPlainProse(item.description, ctx)];
  const links = (Array.isArray(item.effectSlugs) ? item.effectSlugs : [])
    .map((slug) => {
      const page = ctx.effectPagesBySlug?.get(String(slug));
      if (!page) return null;
      ctx.counters.effectNamesLinked += 1;
      return `- [${escapeProse(page.title)}](${page.href})`;
    })
    .filter(Boolean);
  if (links.length > 0) {
    blocks.push(ui.categoryEffectsIntro(links.length));
    blocks.push(links.join("\n"));
  }
  return assemble({
    tree: TREE.effect,
    file: fileNameFor(title, item.slug),
    title,
    description: firstSentence(prose(item.description, ctx.counters) || title),
    blocks,
    source: sourceStatement({
      tree: TREE.effect,
      title,
      url: `${SITE}/effects/category/${item.slug}`,
      licence: LICENCE.effectCategories.statement,
      generatedAt: ctx.generatedAt,
      labels: ctx.labels,
    }),
    labels: ctx.labels,
  });
}

export function reportPage(item, ctx) {
  const { ui, LICENCE, TREE } = ctx.labels;
  const title = String(item.title ?? item.slug);
  const blocks = [];

  const subject = item.subject ?? {};
  const facts = Object.entries(ui.reportFacts)
    .map(([key, label]) => [label, subject[key]])
    .map(([label, value]) => [label, prose(value, ctx.counters)])
    .filter(([, value]) => value);
  const substances = Array.isArray(item.substances) ? item.substances : [];
  if (facts.length > 0 || substances.length > 0) {
    blocks.push([
      ui.reportFactsHeader,
      "| --- | --- |",
      ...facts.map(([label, value]) => `| ${label} | ${cell(escapeProse(value))} |`),
      ...substances.map((entry) => `| ${ui.reportSubstance} | ${cell(escapeProse([entry?.name, entry?.dose, entry?.roa].filter(Boolean).join(" · ")))} |`),
    ].join("\n"));
  }

  const timeline = (entries) => (Array.isArray(entries) ? entries : [])
    .flatMap((entry) => {
      const time = prose(entry?.time, ctx.counters);
      const body = renderPlainProse(entry?.description, ctx);
      if (body.length === 0) return [];
      return time ? [`**${time}**`, ...body] : body;
    });

  for (const [field, heading] of Object.entries(ui.reportSections)) {
    const value = item[field];
    const body = typeof value === "string" ? renderPlainProse(value, ctx) : timeline(value);
    if (body.length === 0) continue;
    blocks.push(`## ${heading}`);
    blocks.push(...body);
  }

  return assemble({
    tree: TREE.report,
    file: fileNameFor(title, item.slug),
    title,
    description: firstSentence(substances.map((entry) => [entry?.dose, entry?.name].filter(Boolean).join(" ")).join(ui.listSeparator) || title),
    blocks,
    source: sourceStatement({
      tree: TREE.report,
      title,
      url: `${SITE}/reports/${item.slug}`,
      licence: LICENCE.reports.perRecord(item).statement,
      translation: LICENCE.reports.perRecord(item).translation,
      generatedAt: ctx.generatedAt,
      labels: ctx.labels,
    }),
    labels: ctx.labels,
  });
}

/** Numbered references, in the marker order the page produced. */
function citationList(ctx) {
  if (ctx.citationOrder.size === 0) return [];
  const byNumber = [...ctx.citationOrder].sort((a, b) => a[1] - b[1]);
  const items = byNumber.map(([id, number]) => {
    const citation = ctx.citationsById.get(id);
    const text = escapeProse(String(citation?.text ?? "").replace(/\s+/g, " ").trim());
    const url = String(citation?.url ?? "").trim();
    return `${number}. <a name="${ctx.anchorPrefix}-${number}"></a>${text}${url ? ` <${url}>` : ""}`;
  });
  return [`## ${ctx.labels.ui.references}`, items.join("\n")];
}

