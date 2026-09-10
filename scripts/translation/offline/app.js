/* dose.wiki 中文 · offline reader. Vanilla JS; inlined into the single-file edition by build-offline.mjs.
   Layouts follow dose.wiki's home, substance index, and substance article pages. */
(() => {
  "use strict";

  const $app = document.getElementById("app");
  let D = null;

  // ---------- boot: inflate the gzip+base64 bundle ----------
  async function boot() {
    const raw = document.getElementById("data").textContent.trim();
    if (typeof DecompressionStream !== "function") {
      $app.innerHTML = '<p class="boot">这个浏览器不支持内置解压（DecompressionStream）。请使用较新的 Chrome、Edge、Safari 或 Firefox 打开本文件。</p>';
      return;
    }
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    D = JSON.parse(await new Response(stream).text());
    window.addEventListener("hashchange", render);
    render();
  }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (name, cls = "i") => {
    const def = D.icons[name];
    return def ? `<svg class="${cls}" viewBox="0 0 ${def.w} ${def.h}" aria-hidden="true">${def.body}</svg>` : "";
  };
  const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  const bySlug = (list) => Object.fromEntries(list.map((entry) => [entry.slug, entry]));
  const S = () => (S.cache ??= bySlug(D.substances));
  const pill = (n) => `<span class="pill">${n}</span>`;
  const NAV = [["substances", "物质", "streamline-ultimate:science-molecule-strucutre-bold"], ["effects", "效应", "material-symbols:person-play-outline-rounded"], ["reports", "报告", "hugeicons:content-writing"], ["library", "资料库", "lucide:book-open-text"], ["downloads", "下载", "charm:download"], ["about", "关于", "lucide:info"]];
  const SECTION_BY_HEADING = { "药理学": "pharmacology", "主观效应": "subjective-effects", "耐受性": "tolerance", "毒性与伤害潜力": "harm-potential", "相互作用": "interactions", "历史与文化": "history-culture", "法律地位": "legality", "试剂检测": "reagent-testing", "参考文献": "sources" };
  const sectionDef = (id) => D.sections.find((s) => s.id === id);
  const TIER_ORDER = ["threshold", "light", "moderate", "strong", "heavy"];
  const STAGE_ORDER = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"];
  const UNIT_ZH = { minutes: "分钟", hours: "小时", days: "天", seconds: "秒", weeks: "周" };

  // ---------- markdown ----------
  function inline(text) {
    let s = text
      .replace(/<sup>/g, "\uE000sup\uE001").replace(/<\/sup>/g, "\uE000/sup\uE001")
      .replace(/<a name="([^"]+)"><\/a>/g, "\uE000a $1\uE001")
      .replace(/<span class="cnote">/g, "\uE000cnote\uE001").replace(/<\/span>/g, "\uE000/cnote\uE001");
    s = esc(s);
    s = s.replace(/\uE000sup\uE001/g, "<sup>").replace(/\uE000\/sup\uE001/g, "</sup>").replace(/\uE000a ([^\uE001]+)\uE001/g, '<a id="$1"></a>')
      .replace(/\uE000cnote\uE001/g, '<span class="cnote">').replace(/\uE000\/cnote\uE001/g, "</span>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Citation markers: [\[3\]](#ref-x-3) -> superscript reference.
    s = s.replace(/\[\\\[(\d+)\\\]\]\((#[^)\s]+)\)/g, '<sup class="ref"><a href="$2">$1</a></sup>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => link(href, label));
    s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => link(url, url));
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\\([[\]])/g, "$1");
    return s;
  }
  function link(href, label) {
    if (href.startsWith("#")) return `<a href="${href}">${label}</a>`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}${icon("lucide:external-link", "i ext")}</a>`;
  }
  function markdown(src) {
    const lines = src.split("\n");
    const out = [];
    let i = 0;
    const para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para.length = 0; } };
    while (i < lines.length) {
      const line = lines[i];
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flush(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i += 1; continue; }
      if (/^\s*$/.test(line)) { flush(); i += 1; continue; }
      if (/^---+\s*$/.test(line)) { flush(); out.push("<hr>"); i += 1; continue; }
      if (line.startsWith(">")) {
        flush();
        const inner = [];
        while (i < lines.length && lines[i].startsWith(">")) { inner.push(lines[i].replace(/^>\s?/, "")); i += 1; }
        out.push(`<blockquote>${markdown(inner.join("\n"))}</blockquote>`);
        continue;
      }
      if (line.startsWith("|")) {
        flush();
        const rows = [];
        while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i += 1; }
        const cells = (row) => row.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
        const head = cells(rows[0]);
        const body = rows.slice(1).filter((row) => !/^\|\s*:?-+/.test(row)).map(cells);
        out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (li) { flush(); out.push(list(lines, i, li[1].length)); i = list.next; continue; }
      para.push(line.trim());
      i += 1;
    }
    flush();
    return out.join("\n");
  }
  function list(lines, start, indent) {
    let i = start;
    const first = lines[i].match(/^(\s*)([-*]|\d+\.)\s+/);
    const ordered = /\d/.test(first[2]);
    const items = [];
    while (i < lines.length) {
      const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (m && m[1].length === indent) { items.push({ text: m[3], children: "" }); i += 1; continue; }
      if (m && m[1].length > indent && items.length) { items[items.length - 1].children += list(lines, i, m[1].length); i = list.next; continue; }
      if (!m && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].text += ` ${lines[i].trim()}`; i += 1; continue; }
      break;
    }
    list.next = i;
    const tag = ordered ? "ol" : "ul";
    const item = (it) => {
      // Effect tag lists: `[name](route)：description` becomes a tag with its note beneath, like the site's effect chips.
      const m = list.chips && it.text.match(/^(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|[^：:[*]{1,40})\s*[：:]\s*(.+)$/);
      if (m) return `<li class="wide"><span class="tag">${inline(m[1])}</span><span class="desc">${inline(m[2])}</span>${it.children}</li>`;
      return `<li>${inline(it.text)}${it.children}</li>`;
    };
    return `<${tag}>${items.map(item).join("")}</${tag}>`;
  }
  /** Split a page at its `## ` headings: [{ heading, body }], with the pre-heading part as heading "". */
  function splitSections(md) {
    const parts = [];
    let current = { heading: "", body: [] };
    for (const line of md.split("\n")) {
      const m = line.match(/^## (.*)$/);
      if (m) { parts.push(current); current = { heading: m[1].trim(), body: [] }; continue; }
      current.body.push(line);
    }
    parts.push(current);
    return parts.map((p) => ({ heading: p.heading, body: p.body.join("\n").trim() }));
  }

  // ---------- chrome ----------
  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [head, ...rest] = hash.split("/");
    return { head: head || "home", rest, path: hash };
  }
  function shell(current, body, wide = false) {
    return `<header class="top"><div class="in">
      <a class="brand" href="#/">${D.logo}<span class="wm"><span>dose<b>.wiki</b></span><small>中文 · 离线版</small></span></a>
      <form class="search" id="search"><input name="q" placeholder="搜索…" aria-label="搜索">${icon("lucide:search")}</form>
      <nav class="main">${NAV.map(([r, l, ic]) => `<a href="#/${r}" class="${current === r ? "on" : ""}">${icon(ic)}<span>${l}</span></a>`).join("")}</nav>
    </div></header>
    <main class="${wide ? "wide" : ""}">${body}</main>
    <footer class="site">
      <p>dose.wiki 中文离线版 · 数据快照 ${esc(D.generatedAt)} · 来源 <a href="${D.site}" target="_blank" rel="noopener">dose.wiki</a> · 物质与效应条目原文为 CC0；体验报告保留作者权利；译文由 GLM 5.3 Flash 生成，人工审校进行中。</p>
      <p>本文件不构成医疗建议。剂量、相互作用与法律信息可能有误或已过时，请以原文与权威来源为准。</p>
    </footer>`;
  }
  const beta = () => `<p class="beta">${icon("lucide:octagon-alert")} dose.wiki 仍处于测试阶段，条目可能存在不准确之处或缺少引注。 ${icon("lucide:octagon-alert")}</p>`;
  const sectionHead = (id, labelOverride) => { const s = sectionDef(id); return `<h2 class="sec-h" id="sec-${id}">${icon(s?.icon ?? "lucide:file-text")}<span>${esc(labelOverride ?? s?.label ?? id)}</span><i></i></h2>`; };
  const pageTitle = (title, iconName) => `<h1 class="ptitle">${iconName ? icon(iconName) : ""}${esc(title)}</h1>`;
  const notFound = () => `<p class="empty">没有这个页面。</p>`;

  function render() {
    const r = route();
    let body, wide = false;
    try {
      const out = views[r.head] ? views[r.head](r) : notFound();
      if (typeof out === "string") body = out; else { body = out.html; wide = !!out.wide; }
    } catch (error) {
      body = `<p class="empty">渲染出错：${esc(error.message)}</p>`;
    }
    $app.innerHTML = shell(r.head, body, wide);
    document.getElementById("search").addEventListener("submit", (event) => {
      event.preventDefault();
      const q = new FormData(event.target).get("q").trim();
      if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
    });
    const anchor = location.hash.match(/#(ref-[^#]+|sec-[^#]+)$/);
    if (anchor) document.getElementById(anchor[1])?.scrollIntoView(); else window.scrollTo(0, 0);
  }

  // ---------- generic markdown page with site-style section headers ----------
  function doc(routeKey, { back, extra = "", sectionIds = {} } = {}) {
    const md = D.pages[routeKey];
    if (!md) return notFound();
    const parts = splitSections(md);
    const lead = parts[0].body.replace(/^# .*\n?/, "");
    const title = md.match(/^# (.*)$/m)?.[1] ?? "";
    const sections = parts.slice(1).map((p) => {
      const id = sectionIds[p.heading] ?? SECTION_BY_HEADING[p.heading] ?? p.heading;
      return `<section class="sec sec-${id}">${sectionHead(id, p.heading)}${markdown(p.body)}</section>`;
    });
    return `<article class="doc">${back ? `<a class="back" href="${back.href}">${icon("lucide:arrow-left")}${back.label}</a>` : ""}
      <div class="hero-card">${extra}<h1>${esc(title)}</h1>${markdown(lead)}</div>${sections.join("")}</article>`;
  }

  // ---------- views ----------
  const views = {
    home() {
      const counts = { substances: D.substances.length, effects: D.effects.length, reports: D.reports.length, library: D.library.length, downloads: D.downloads.length };
      const labels = { substances: "物质", effects: "效应", reports: "报告", library: "资料库", downloads: "下载" };
      return `<div class="home">
        <div class="hero">${D.logo}<h1>dose<b>.wiki</b><sup>离线版</sup></h1><p>${esc(D.tagline)}</p></div>
        <div class="tiles">${D.tiles.map((t) => `<a class="tile" href="#/${t.route}"><span class="box">${icon(t.icon, "")}</span><span class="l">${labels[t.route]}</span><span class="n">${counts[t.route]}</span></a>`).join("")}</div>
      </div>`;
    },

    substances(r) {
      const [a, b] = r.rest;
      if (a && a !== "chemical" && a !== "psychoactive") return substancePage(a);
      const chemical = a === "chemical";
      const only = a === "psychoactive" ? b : null;
      const item = (slug) => { const s = S()[slug]; return s ? `<li><a href="#/substances/${slug}">${esc(s.title)}</a></li>` : ""; };
      const count = (c) => new Set(c.sections.flatMap((s) => s.drugs)).size;
      const filters = `<div class="filters">
        <a href="#/substances" class="${!chemical && !only ? "on" : ""}">${icon("streamline-ultimate:science-molecule-strucutre-bold")}全部</a>
        ${D.psychoactive.filter(count).map((c) => `<a href="#/substances/psychoactive/${c.key}" class="${only === c.key ? "on" : ""}">${icon(c.icon)}${esc(c.label)}</a>`).join("")}
        <a href="#/substances/chemical" class="${chemical ? "on" : ""}">${icon("lucide:hexagon")}化学类别</a>
      </div>`;
      let cards;
      if (chemical) {
        cards = D.chemical.map((c) => `<section class="ccard"><header>${icon(c.icon, "badge")}<h2>${esc(c.label)}</h2>${pill(c.members.length)}</header><p class="cd">${inline(c.description)}</p><ul>${c.members.map(item).join("")}</ul></section>`);
      } else {
        cards = D.psychoactive.filter((c) => count(c) && (!only || c.key === only)).map((c) => `<section class="ccard"><header>${icon(c.icon, "badge")}<h2>${esc(c.label)}</h2>${pill(count(c))}</header>
          ${only ? `<p class="cd">${inline(c.description)}</p>${c.warning ? `<p class="warn">${inline(c.warning)}</p>` : ""}` : ""}
          ${c.sections.filter((s) => s.drugs.length).map((s) => `<h3>${esc(s.label)}${pill(s.drugs.length)}</h3><ul>${s.drugs.map(item).join("")}</ul>`).join("")}</section>`);
      }
      return { wide: true, html: `<div class="index-head">${pageTitle("物质索引", "streamline-ultimate:science-molecule-strucutre-bold")}${beta()}</div>${filters}<div class="masonry ${only ? "single" : ""}">${cards.join("")}</div>` };
    },

    effects(r) {
      const back = { href: "#/effects", label: "主观效应索引" };
      if (r.rest[0] === "category" && r.rest[1]) return doc(`effects/category/${r.rest[1]}`, { back });
      if (r.rest[0]) return doc(`effects/${r.rest[0]}`, { back });
      const intro = D.intro.effects.replace("{{effectCount}}", D.effects.length);
      const byCat = new Set(D.effectCategories.flatMap((c) => c.effects));
      const item = (slug) => { const e = D.effects.find((x) => x.slug === slug); return e ? `<li><a href="#/effects/${slug}">${esc(e.name)}</a></li>` : ""; };
      const cards = D.effectCategories.map((c) => `<section class="ccard"><header>${icon(c.icon, "badge")}<h2><a href="#/effects/category/${c.slug}">${esc(c.name)}</a></h2>${pill(c.effects.length)}</header><p class="cd">${esc(c.description)}</p><ul>${c.effects.map(item).join("")}</ul></section>`);
      const rest = D.effects.filter((e) => !byCat.has(e.slug));
      if (rest.length) cards.push(`<section class="ccard"><header>${icon("lucide:list", "badge")}<h2>其他效应</h2>${pill(rest.length)}</header><ul>${rest.map((e) => item(e.slug)).join("")}</ul></section>`);
      return { wide: true, html: `<div class="index-head">${pageTitle("主观效应索引", "material-symbols:person-play-outline-rounded")}<p class="lead">${inline(intro)}</p></div><div class="masonry">${cards.join("")}</div>` };
    },

    reports(r) {
      if (r.rest[0]) return reportPage(r.rest[0]);
      return { wide: true, html: `<div class="index-head">${pageTitle("体验报告", "hugeicons:content-writing")}<p class="lead">${inline(D.intro.reports.replace("(/effects)", "(#/effects)"))}</p></div>
        <ul class="rows cols">${D.reports.map((p) => `<li><a href="#/reports/${p.slug}">${esc(p.title)}</a><span class="s">${p.substances.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</span><span class="m">${esc(p.date)}</span></li>`).join("")}</ul>` };
    },

    library(r) {
      if (r.rest[0]) return doc(`library/${r.rest[0]}`, { back: { href: "#/library", label: "资料库" } });
      const group = (key, title) => { const items = D.library.filter((x) => x.group === key); return items.length ? `<h2 class="sec-h">${icon("lucide:book-open")}<span>${title}</span><i></i></h2><div class="cards masonry-cards">${items.map((a) => `<a class="card" href="#/library/${a.slug}"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.blurb)}</div></a>`).join("")}</div>` : ""; };
      return { wide: true, html: `<div class="index-head">${pageTitle("资料库", "lucide:book-open-text")}<p class="lead">${inline(D.intro.library)}</p></div>${group("articles", "长篇文章")}${group("summaries", "各类物质效应总览")}` };
    },

    downloads() {
      const embedded = { substances: ["substances", "SubstanceIndex"], effects: ["effects", "EffectIndex"] };
      return `<div class="index-head">${pageTitle("下载", "charm:download")}<p class="lead">完整数据包托管在 dose.wiki，JSON 与 Markdown 各有简体中文与英文两版；本文件内嵌的索引也可直接另存。</p></div>
        ${D.downloads.map((d) => `<section class="dl"><h2>${esc(d.title)}</h2><p>${esc(d.summary)}</p><div class="btns">${d.files.map((f) => `<a class="btn" href="${f.href}" target="_blank" rel="noopener">${icon("charm:download")}${esc(f.label)}<small>${fmtBytes(f.bytes)}</small></a>`).join("")}${embedded[d.id] ? `<button class="btn p" data-embed="${embedded[d.id][0]}" data-name="${embedded[d.id][1]}">${icon("charm:download")}另存内嵌索引 · JSON</button>` : ""}</div></section>`).join("")}
        <section class="dl stmt-card">${markdown(D.statement.zh.split("\n\n").slice(0, 3).join("\n\n"))}<div class="btns"><a class="btn p" href="#/about">${icon("lucide:info")}读完整声明 · Read the full statement</a></div></section>`;
    },

    about() {
      return `<article class="doc statement">
        <div class="index-head">${pageTitle("关于本文件", "lucide:info")}<p class="lead">这份离线版由 dose.wiki 的作者 Josie Kins 制作并赠予中文读者。下面是她写给 FreeODwiki 的话，中文在上，英文原文在下。</p></div>
        <div class="hero-card stmt">${markdown(D.statement.zh)}</div>
        <div class="hero-card stmt en" lang="en">${markdown(D.statement.en)}</div>
        <p class="stmt-sig">— Josie Kins · <a href="${D.site}" target="_blank" rel="noopener">dose.wiki</a> · <a href="https://josiekins.xyz" target="_blank" rel="noopener">josiekins.xyz</a></p>
      </article>`;
    },

    search(r) {
      const q = (r.rest.join("/") || "").trim().toLowerCase();
      if (!q) return notFound();
      const hit = (s) => String(s ?? "").toLowerCase().includes(q);
      const subs = D.substances.filter((s) => hit(s.title) || hit(s.slug) || s.aliases.some(hit));
      const effs = D.effects.filter((e) => hit(e.name) || hit(e.slug));
      const reps = D.reports.filter((p) => hit(p.title) || p.substances.some(hit));
      const libs = D.library.filter((a) => hit(a.title));
      const section = (title, items, f) => items.length ? `<h2 class="sec-h">${icon("lucide:search")}<span>${title}</span>${pill(items.length)}<i></i></h2><ul class="rows">${items.map(f).join("")}</ul>` : "";
      const total = subs.length + effs.length + reps.length + libs.length;
      return `<div class="index-head">${pageTitle(`搜索：${q}`, "lucide:search")}</div>${total ? "" : `<p class="empty">没有找到匹配的条目。</p>`}
        ${section("物质", subs, (s) => `<li><a href="#/substances/${s.slug}">${esc(s.title)}</a><span class="s">${esc(s.summary)}</span></li>`)}
        ${section("主观效应", effs, (e) => `<li><a href="#/effects/${e.slug}">${esc(e.name)}</a><span class="s">${esc(e.summary)}</span></li>`)}
        ${section("体验报告", reps, (p) => `<li><a href="#/reports/${p.slug}">${esc(p.title)}</a><span class="s">${esc(p.substances.join(" · "))}</span></li>`)}
        ${section("资料库", libs, (a) => `<li><a href="#/library/${a.slug}">${esc(a.title)}</a></li>`)}`;
    },
  };

  // ---------- substance article ----------
  const zhUnits = (text) => String(text).replace(/\b(\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*(seconds?|minutes?|hours?|days?|weeks?)\b/gi, (_, n, u) => `${n.replace(/\s*-\s*/, "–")} ${UNIT_ZH[u.toLowerCase().replace(/s$/, "") + "s"] ?? u}`);
  const fmtRange = (v) => {
    if (!v) return "";
    const unit = UNIT_ZH[v.unit] ?? v.unit ?? "";
    const sep = UNIT_ZH[v.unit] ? " " : " ";
    if (v.min != null && v.max != null) return `${v.min}–${v.max}${sep}${unit}`;
    if (v.min != null) return `${v.min}+${sep}${unit}`;
    return `≤${v.max}${sep}${unit}`;
  };
  function dosagePanel(s, route) {
    const d = s.dosage.find((x) => x.route === route);
    const t = s.duration.find((x) => x.route === route);
    const tiers = d ? TIER_ORDER.filter((k) => d.tiers[k]).map((k) => `<div class="tier tier-${k}"><span>${esc(D.enums["dose-tier"][k] ?? k)}</span><code>${esc(fmtRange(d.tiers[k]))}</code></div>`).join("") : "";
    const stages = t ? STAGE_ORDER.filter((k) => t.stages[k]).map((k) => `<div class="stage"><span>${esc(D.enums["duration-stage"][k] ?? k)}</span><code>${esc(fmtRange(t.stages[k]))}</code></div>`).join("") : "";
    return `<div class="dd">
      <div class="panel"><h3>${icon("lucide:chart-column-increasing")}剂量</h3><p class="note">${icon("lucide:info")}剂量为人群估计值，个体差异很大。</p>${tiers || '<p class="note">暂无该途径的剂量数据。</p>'}${d?.notes ? `<p class="fine">${inline(d.notes)}</p>` : ""}</div>
      <div class="panel"><h3>${icon("lucide:chart-line")}时长</h3>${stages || '<p class="note">暂无该途径的时长数据。</p>'}${t?.halfLife ? `<div class="stage hl"><span>半衰期</span><code>${esc(zhUnits(t.halfLife))}</code></div>` : ""}</div>
    </div>`;
  }
  /** The site's rule: presets are enabled on named slugs, tone-ordered, at most two per article. */
  const bannersFor = (slug) => D.banners.filter((b) => b.slugs.includes(slug)).slice(0, 2);
  const bannerHtml = (b) => `<aside class="banner banner--${b.tone}" role="${b.tone === "danger" ? "alert" : "status"}">
    <div class="bi">${icon(b.icon, "")}</div>
    <div class="bb"><p class="bh"><span class="sev">${esc(b.severityLabel)}</span>${esc(b.headline)}</p>
    ${b.points.map((point) => `<p class="bp">${inline(point)}</p>`).join("")}</div>
  </aside>`;

  function substancePage(slug) {
    const s = S()[slug];
    const md = D.pages[`substances/${slug}`];
    if (!s || !md) return notFound();
    const parts = splitSections(md);
    const routes = [...new Set([...s.dosage.map((x) => x.route), ...s.duration.map((x) => x.route)])];
    const routeLabel = (k) => D.enums.route[String(k).toLowerCase()] ?? k;
    const pcLabel = (name) => D.psychoactive.find((x) => x.key === String(name).toLowerCase().replace(/\s*\(.*\)$/, ""))?.label ?? name;
    const ccLabel = (name) => D.chemical.find((x) => x.key === String(name).toLowerCase())?.label ?? name;
    const aliases = s.aliases;
    const shown = aliases.slice(0, 5);
    const more = aliases.length - shown.length;
    const hero = `<div class="hero-card sub">
      ${D.molecules[slug] ? `<figure class="mol">${D.molecules[slug]}</figure>` : ""}
      <h1>${esc(s.title)}</h1>
      ${s.iupac ? `<p class="meta">${icon("lucide:book-open")}<span>${esc(s.iupac)}</span></p>` : ""}
      ${aliases.length ? `<p class="meta">${icon("lucide:message-square-quote")}<span>${esc(shown.join(", "))}</span>${more > 0 ? `<button class="more" data-more="${esc(aliases.slice(5).join(", "))}">+${more} ${icon("lucide:chevron-down")}</button>` : ""}</p>` : ""}
      ${s.pc.length ? `<div class="cls"><span class="k">${icon("lucide:brain-cog")}精神活性类别</span><span class="chips">${s.pc.map((n) => `<span class="chip">${esc(pcLabel(n))}</span>`).join("")}</span></div>` : ""}
      ${s.cc.length ? `<div class="cls"><span class="k">${icon("lucide:hexagon")}化学类别</span><span class="chips">${s.cc.map((n) => `<span class="chip">${esc(ccLabel(n))}</span>`).join("")}</span></div>` : ""}
      <hr>${markdown(leadOf(parts[0].body))}
    </div>`;
    const dd = routes.length ? `<section class="sec" id="sec-dosage-duration">${sectionHead("dosage-duration")}
      ${routes.length > 1 ? `<div class="tabs" data-tabs>${routes.map((k, i) => `<button class="${i === 0 ? "on" : ""}" data-route="${k}">${esc(routeLabel(k))}</button>`).join("")}</div>` : `<div class="tabs"><button class="on">${esc(routeLabel(routes[0]))}</button></div>`}
      <div data-dd>${dosagePanel(s, routes[0])}</div></section>` : "";
    const present = new Set(routes.length ? ["dosage-duration"] : []);
    const sections = parts.slice(1).map((p) => {
      const id = SECTION_BY_HEADING[p.heading] ?? p.heading;
      present.add(id);
      list.chips = id === "subjective-effects";
      const body = id === "legality" ? legalityBody(p.body) : p.body;
      const html = `<section class="sec sec-${id}" id="sec-${id}">${sectionHead(id, p.heading)}${markdown(body)}</section>`;
      list.chips = false;
      return html;
    });
    const toc = `<aside class="toc"><div class="toc-in"><p>目录</p><a href="#/substances/${slug}#sec-overview">${icon("lucide:file-text")}简介</a>${D.sections.filter((x) => x.toc && present.has(x.id)).map((x) => `<a href="#/substances/${slug}#sec-${x.id}">${icon(x.icon)}${esc(x.label)}</a>`).join("")}</div></aside>`;
    return { wide: true, html: `<div class="article">${toc}<article class="doc" id="sec-overview">${beta()}${bannersFor(slug).map(bannerHtml).join("")}${hero}${dd}${sections.join("")}</article></div>`, sub: s };
  }
  /**
   * The exporter writes the country table and then a "各国备注" list of each
   * country's note. The site keeps the note inside the country's row, so fold
   * the list back into the table and drop the second listing.
   */
  function legalityBody(body) {
    const marker = body.indexOf("#### 各国备注");
    if (marker < 0) return body;
    const notes = new Map();
    const tail = body.slice(marker).split("\n").slice(1);
    let rest = [];
    for (const line of tail) {
      const m = line.match(/^- \*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
      if (m) notes.set(m[1].trim(), m[2].trim()); else if (line.trim()) rest.push(line);
    }
    if (!notes.size) return body;
    const head = body.slice(0, marker).split("\n").map((line) => {
      const m = line.match(/^\| ([^|]+?) \|(.*)$/);
      if (!m || /^\| *-|^\| 国家/.test(line)) return line;
      const note = notes.get(m[1].trim());
      return note ? `| ${m[1]} |${m[2].replace(/\|\s*$/, "")}<span class="cnote">${note.replace(/\|/g, "&#124;")}</span> |` : line;
    });
    return [...head, ...rest].join("\n");
  }

  /** The exporter's lead block minus the title and its own dosage/duration tables, which the reader draws itself. */
  function leadOf(body) {
    const lines = body.replace(/^# .*\n?/, "").split("\n");
    const out = [];
    let skipping = false;
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) skipping = /^####\s+(💊|⏱️)/.test(line);
      if (!skipping) out.push(line);
    }
    return out.join("\n").trim();
  }

  // ---------- trip report ----------
  const REPORT_META_ICON = { "投稿人": "lucide:user", "年龄": "lucide:calendar", "性别": "lucide:user", "体重": "lucide:scale", "身高": "lucide:ruler", "情境": "lucide:map-pin", "日期": "lucide:clock" };
  /**
   * The exporter writes the record header as a two-column Markdown table and
   * repeats the "物质" row once per dose. The site shows those as labelled
   * facts and dose chips, so the reader rebuilds them rather than printing a
   * table with two meaningless column headings.
   */
  function reportPage(slug) {
    const md = D.pages[`reports/${slug}`];
    if (!md) return notFound();
    const entry = D.reports.find((p) => p.slug === slug);
    const parts = splitSections(md);
    const facts = [], doses = [];
    for (const line of parts[0].body.split("\n")) {
      const cells = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
      if (!cells || cells[1] === "项目" || /^-+$/.test(cells[1])) continue;
      if (cells[1] === "物质") doses.push(cells[2]); else facts.push([cells[1], cells[2]]);
    }
    const lead = parts[0].body.replace(/^# .*$/m, "").replace(/^\[.*?\]\(index\.md\)$/m, "").replace(/^\|.*$/gm, "").trim();
    const sections = parts.slice(1).map((p) => {
      const id = p.heading === "参考文献" ? "sources" : "report";
      return `<section class="sec sec-${id}">${sectionHead(id === "sources" ? "sources" : "subjective-effects", p.heading)}${markdown(timeline(p.body))}</section>`;
    });
    return `<article class="doc report">
      <a class="back" href="#/reports">${icon("lucide:arrow-left")}体验报告</a>
      <div class="hero-card">
        <h1>${esc(entry?.title ?? md.match(/^# (.*)$/m)?.[1] ?? slug)}</h1>
        ${doses.length ? `<div class="doses">${doses.map((d) => `<span class="dose">${d.split(" · ").map((bit, i) => `<b class="${i ? "u" : "n"}">${esc(bit)}</b>`).join("")}</span>`).join("")}</div>` : ""}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${icon(REPORT_META_ICON[k] ?? "lucide:info")}${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${lead ? markdown(lead) : ""}
      </div>${sections.join("")}
    </article>`;
  }
  /** `**T+00:15**` or `**11:23 PM**` alone on a line is a timeline stamp, not a bold paragraph. */
  const timeline = (body) => body.replace(/^\*\*([T\d][^*]{0,24})\*\*\s*$/gm, "###### $1");

  // ---------- delegated interactions ----------
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tabs] button[data-route]");
    if (tab) {
      const s = S()[route().rest[0]];
      tab.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === tab));
      document.querySelector("[data-dd]").innerHTML = dosagePanel(s, tab.dataset.route);
      return;
    }
    const more = event.target.closest("button[data-more]");
    if (more) { more.previousElementSibling.textContent += `, ${more.dataset.more}`; more.remove(); return; }
    const button = event.target.closest("button[data-embed]");
    if (button) {
      const key = button.dataset.embed;
      const payload = { source: D.site, generatedAt: D.generatedAt, locale: "zh-Hans", note: "离线版内嵌索引（摘要级）；完整记录请下载 dose.wiki 上的数据包。", items: D[key] };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `${button.dataset.name}.zh-Hans.index.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  boot().catch((error) => { $app.innerHTML = `<p class="boot">加载失败：${esc(error.message)}</p>`; });
})();
