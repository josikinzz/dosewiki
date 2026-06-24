export const meta = {
  name: 'page-load-audit',
  description: 'Explore every public page type for safe load-time wins, then triage into auto-safe / needs-judgment / skip tiers',
  phases: [
    { title: 'Explore', detail: 'one read-only explorer per page type' },
    { title: 'Triage', detail: 'adversarial zero-UX-regression + safety verdict per finding' },
    { title: 'Synthesize', detail: 'dedup, rank, bucket into tiers' },
  ],
}

// One representative URL + source entry per public page type. Read-only analysis;
// builds/servers are singletons and MUST NOT be run by agents.
const PAGE_TYPES = [
  { type: 'homepage', url: '/', source: 'src/app/page.tsx' },
  { type: 'substance-article', url: '/2c-b', source: 'src/app/[slug]/page.tsx' },
  { type: 'substances-index', url: '/substances', source: 'src/app/substances/page.tsx' },
  { type: 'effects-index', url: '/effects', source: 'src/app/effects/page.tsx' },
  { type: 'effect-glossary', url: '/effect/abnormal-heartbeat', source: 'src/app/effect/[effectSlug]/page.tsx' },
  { type: 'effect-article', url: '/effects/abnormal-heartbeat', source: 'src/app/effects/[effectSlug]/page.tsx' },
  { type: 'effects-category', url: '/effects/category/auditory-effects', source: 'src/app/effects/category/[categorySlug]/page.tsx' },
  { type: 'category', url: '/category/psychedelic', source: 'src/app/category/[categoryKey]/page.tsx' },
  { type: 'chemical', url: '/chemical/lysergamide', source: 'src/app/chemical/[slug]/page.tsx' },
  { type: 'psychoactive', url: '/psychoactive/psychedelic', source: 'src/app/psychoactive/[slug]/page.tsx' },
  { type: 'mechanism', url: '/mechanism/5-ht1-receptor-agonist', source: 'src/app/mechanism/[mechanismSlug]/page.tsx' },
  { type: 'contributor-profile', url: '/contributors/josie', source: 'src/app/contributors/[profileKey]/page.tsx' },
  { type: 'reports-index', url: '/reports', source: 'src/app/reports/page.tsx' },
  { type: 'report', url: '/reports/(resolve a real slug, or analyze source only)', source: 'src/app/reports/[slug]/page.tsx' },
  { type: 'about', url: '/about', source: 'src/app/about/page.tsx' },
  { type: 'docs', url: '/docs/how', source: 'src/app/docs/how/page.tsx (also docs/code, docs/license)' },
  { type: 'interactions', url: '/interactions', source: 'src/app/interactions/page.tsx' },
  { type: 'mantras', url: '/mantras', source: 'src/app/mantras/page.tsx' },
  { type: 'data', url: '/data', source: 'src/app/data/page.tsx' },
  { type: 'search', url: '/search', source: 'src/app/search/page.tsx' },
]

const PLAYBOOK = `
KNOWN HIGH-VALUE PATTERNS (from a prior audit of this repo — pattern-match these first):
1. rsc-overserialization: a server component passes FULL data objects to a "use client"
   component that only renders a subset -> the whole object is serialized into the RSC/HTML
   payload. (Real example fixed: /about passed 12 complete SubstanceArticle objects to a
   preview that showed one truncated; projecting to the rendered shape cut ~70KB gz.)
   Substance/effect/report pages are prime suspects — check what props cross "use client"
   boundaries and whether the client renders all of it.
2. barrel-type-leak: a client component value-imports a PURE helper through a barrel
   (e.g. import { x } from "@/schema") whose index re-exports Zod-heavy modules, dragging
   the entire Zod graph into the client bundle. (Fixed on /substances: ~109KB gz via a
   one-line deep import.) Grep each route's client components for value-imports of
   @/schema, zod, or other heavy barrels that should be deep-imports or "import type".
3. eager-import / dev-tool-in-public: a heavy or dev-only module statically imported into a
   public route or shared layout (icon collections, editors, color tools, charting, markdown
   engines). Should be lazy/dynamic or removed from the public path.
4. unoptimized-image: raw <img>/large PNG/JPG instead of next/image, missing width/height,
   no modern format. (Do NOT touch trust/identity assets: logos, publication logos, team/
   advisor headshots — and never bake text into images.)
5. render-blocking-css / globally-imported CSS only used on some routes.
6. font: non-WOFF2 fonts (already converted globally, but check route-specific font loads).
7. duplicate-chunk / loaded-but-unused code.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['pageType', 'findings'],
  additionalProperties: false,
  properties: {
    pageType: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file', 'pattern', 'mechanism', 'proposedFix', 'estKBPerRoute', 'uxImpact', 'risk', 'confidence', 'sharedComponent'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          file: { type: 'string', description: 'file:line of the root cause' },
          pattern: { type: 'string', enum: ['rsc-overserialization', 'barrel-type-leak', 'eager-import', 'dev-tool-in-public', 'unoptimized-image', 'render-blocking-css', 'font', 'duplicate-chunk', 'other'] },
          mechanism: { type: 'string', description: 'why the cost exists, with evidence' },
          proposedFix: { type: 'string', description: 'concrete change (files + what)' },
          estKBPerRoute: { type: 'number' },
          sharedComponent: { type: 'boolean', description: 'true if the root cause is a shared component/layout, so the fix helps many routes' },
          uxImpact: { type: 'string', enum: ['none', 'minor', 'visible'] },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['uxRegression', 'safeToAutoApply', 'tier', 'rationale'],
  additionalProperties: false,
  properties: {
    uxRegression: { type: 'boolean', description: 'does this change ANYTHING the user sees or can do? (alignment, content, interactions, affordances)' },
    safeToAutoApply: { type: 'boolean' },
    tier: { type: 'string', enum: ['A', 'B', 'C'], description: 'A=auto-safe+zero-UX, B=needs human judgment, C=skip/dead-end' },
    rationale: { type: 'string' },
    refinedFix: { type: 'string' },
  },
}

function explorePrompt(pt) {
  return `You are a READ-ONLY performance explorer for the dose.wiki Next.js 16 (App Router, Turbopack) site at /Users/josie/Documents/Utilities/dose.wiki copy.

PAGE TYPE: ${pt.type}
REPRESENTATIVE URL: ${pt.url}
SOURCE ENTRY: ${pt.source}

A fresh production build already exists in .next/. Your job: find SAFE load-time wins for THIS page type by static analysis.

HARD RULES:
- Do NOT edit/create/delete any file. Do NOT run \`npm run build\`, \`next build\`, \`next start\`, or any dev server — those are shared singletons and would corrupt the build for other agents. Read-only shell (grep/cat/ls/node -e reading JSON), Read, Grep, Glob only. You MAY read existing .next/ artifacts (prerendered HTML under .next/server/app, chunk files under .next/static/chunks).
- Respect AGENTS.md invariants: never propose touching trust/identity assets (logos, publication logos, team/advisor headshots); never bake text into images; never change Convex data ownership.
- ZERO UX REGRESSION is mandatory for anything you'd call safe: the fix must not change what the user sees, reads, or can do.

${PLAYBOOK}

METHOD:
1. From the source entry, map the route's component tree and which components are "use client".
2. Find what props cross "use client" boundaries (rsc-overserialization candidates).
3. Grep client components in this route's tree for value-imports of @/schema / zod / heavy barrels (barrel-type-leak), and for eager heavy/dev imports.
4. Identify the route's loaded chunks/CSS/fonts/images from the prerendered HTML (.next/server/app/...html) and fingerprint big chunks.
5. For each finding give: title, file:line, pattern, mechanism (with evidence), a concrete proposedFix, estKBPerRoute, sharedComponent (does it live in shared layout/components?), uxImpact (none/minor/visible — be honest), risk, confidence.

Report only real, evidence-backed findings (no speculation). If the page is already lean, return an empty findings array. Return conclusions, not file dumps.`
}

function triagePrompt(f) {
  return `You are an adversarial SAFETY + UX reviewer for a proposed load-time optimization on the dose.wiki site (/Users/josie/Documents/Utilities/dose.wiki copy). READ-ONLY: do not edit files, do not run builds/servers.

PROPOSED CHANGE:
- title: ${f.title}
- pattern: ${f.pattern}
- file: ${f.file}
- affects page types: ${(f.pageTypes || []).join(', ')}
- mechanism: ${f.mechanism}
- proposedFix: ${f.proposedFix}
- explorer's est: ${f.estKBPerRoute}KB/route, uxImpact=${f.uxImpact}, risk=${f.risk}, confidence=${f.confidence}, sharedComponent=${f.sharedComponent}

Your task: verify the claim by reading the actual code, and rule on SAFETY. The bar for auto-apply is strict:
- uxRegression MUST be false: the change must not alter ANY rendered output, copy, layout, interaction, or affordance. If it changes even what a "Copy" button copies, what an animation does, or removes a feature/option, that is a UX regression -> tier B.
- safeToAutoApply true only if: zero UX regression, low risk, the mechanism is real (you verified it), and it won't break other consumers (check imports/tests/types). Default to NOT safe if uncertain.
- tier: A = safe to auto-apply now (zero UX, low risk, verified). B = real win but needs a human call (any UX-visible change, behavior change, medium+ risk, or ambiguity). C = skip (not a real win, already optimal, or unsafe).

Provide a refinedFix (the concrete, minimal change) and a short rationale citing what you verified. Be skeptical — it is better to demote a borderline item to B than to auto-apply something that touches UX.`
}

// ---- Phase 1: explore every page type in parallel (barrier — triage needs all) ----
phase('Explore')
const raw = await parallel(
  PAGE_TYPES.map((pt) => () =>
    agent(explorePrompt(pt), { schema: FINDINGS_SCHEMA, phase: 'Explore', label: `explore:${pt.type}`, agentType: 'Explore' })
  )
)
const findings = raw
  .filter(Boolean)
  .flatMap((r) => (r.findings || []).map((f) => ({ ...f, pageType: r.pageType })))

log(`Explore: ${findings.length} raw findings across ${PAGE_TYPES.length} page types`)

// Dedup: shared-component findings surfaced by multiple page types merge into one item,
// accumulating affected page types and keeping the max estimate. Plain code (cross-item).
const byKey = new Map()
for (const f of findings) {
  const key = `${(f.file || '').split(':')[0]}|${f.pattern}`
  if (!byKey.has(key)) {
    byKey.set(key, { ...f, pageTypes: [f.pageType] })
  } else {
    const e = byKey.get(key)
    if (!e.pageTypes.includes(f.pageType)) e.pageTypes.push(f.pageType)
    e.estKBPerRoute = Math.max(e.estKBPerRoute || 0, f.estKBPerRoute || 0)
    if (f.confidence === 'high') e.confidence = 'high'
  }
}
const deduped = [...byKey.values()].map((f, i) => ({ ...f, id: `F${i + 1}` }))
log(`Dedup: ${deduped.length} unique findings`)

// ---- Phase 2: adversarial UX/safety verdict per finding, in parallel ----
phase('Triage')
const triaged = (
  await parallel(
    deduped.map((f) => () =>
      agent(triagePrompt(f), { schema: VERDICT_SCHEMA, phase: 'Triage', label: `triage:${f.id}`, effort: 'high' })
        .then((v) => (v ? { ...f, ...v } : null))
    )
  )
).filter(Boolean)

// Bucket in code, but trust the adversarial verdict: a finding is Tier A only if the
// reviewer cleared it (tier A, no UX regression, safe to auto-apply).
const tierA = triaged.filter((f) => f.tier === 'A' && f.uxRegression === false && f.safeToAutoApply === true)
const tierB = triaged.filter((f) => !(f.tier === 'A' && f.uxRegression === false && f.safeToAutoApply === true) && f.tier !== 'C')
const tierC = triaged.filter((f) => f.tier === 'C')

const rank = (f) => (f.estKBPerRoute || 0) * (f.pageTypes ? f.pageTypes.length : 1)
tierA.sort((a, b) => rank(b) - rank(a))
tierB.sort((a, b) => rank(b) - rank(a))

log(`Triage: ${tierA.length} auto-safe (A), ${tierB.length} needs-judgment (B), ${tierC.length} skip (C)`)

// ---- Phase 3: synthesis for ordering + cross-cutting notes ----
phase('Synthesize')
const summary = await agent(
  `You are synthesizing a load-time optimization plan for dose.wiki. Here are the triaged findings as JSON.

TIER A (auto-safe, zero UX, will be auto-implemented through a build/measure/verify gate):
${JSON.stringify(tierA.map((f) => ({ id: f.id, title: f.title, file: f.file, pattern: f.pattern, pageTypes: f.pageTypes, estKBPerRoute: f.estKBPerRoute, refinedFix: f.refinedFix })), null, 1)}

TIER B (needs human judgment):
${JSON.stringify(tierB.map((f) => ({ id: f.id, title: f.title, pattern: f.pattern, pageTypes: f.pageTypes, estKBPerRoute: f.estKBPerRoute, rationale: f.rationale })), null, 1)}

Write a concise plan: (1) recommended implementation ORDER for Tier A (shared-component fixes first since they help many routes; group changes that touch the same file so they can be one iteration; flag any two Tier-A items that edit the same file and would conflict). (2) the single highest-value win. (3) any cross-cutting note (e.g. a pattern that recurs across many page types). (4) a one-line caveat on what the static estimates might miss. Keep it tight — this guides a serialized implementation loop.`,
  { phase: 'Synthesize', label: 'synthesize' }
)

return {
  counts: { raw: findings.length, deduped: deduped.length, tierA: tierA.length, tierB: tierB.length, tierC: tierC.length },
  tierA,
  tierB,
  tierC,
  plan: summary,
}
