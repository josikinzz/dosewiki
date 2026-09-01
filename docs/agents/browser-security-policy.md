# Browser Security Policy

Last reviewed: 2026-07-24

This document is the deployment and review contract for dose.wiki's enforced browser security headers.

## Enforcement model

Middleware splits the document CSP by path:

- Public documents (everything outside `/dev`) use `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`, plus the analytics source on an approved host. They receive no nonce or script hash, and middleware does not forward `x-nonce`. This keeps the root layout request-independent so route-level static generation and ISR remain effective.
- Protected `/dev` documents receive a cryptographically random nonce. Middleware places the nonce-bearing CSP on the internal request so Next.js can nonce its framework and hydration scripts, and applies the same CSP to the document response. The policy also includes hashes for the deterministic Zod jitless and theme bootstrap scripts, which do not carry nonce attributes. The nonce is not exposed as a standalone response header.

The separate `Content-Security-Policy-Report-Only` header used during the observation phase is no longer emitted. The enforced policy retains `report-uri /api/csp-report`, so violations continue to reach the size-limited, rate-limited, redacting collector without generating duplicate enforce/report-only events.

API routes do not receive the document CSP. They retain route-owned content policies; in particular, database-backed molecule SVGs keep their `sandbox` policy instead of being replaced by the HTML policy. The other baseline headers still apply to APIs.

## Reviewed source expressions

The source inventory below comes from repository tracing plus a local production-build browser smoke on 2026-07-11. It is not production telemetry; no production CSP log store was available to this implementation.

| Directive/source | Where allowed | Why it is required |
| --- | --- | --- |
| `'self'` | All directives that load app resources | Next.js chunks, same-origin APIs, local fonts/assets, the RDKit loader and WASM, and form submissions are served by the application origin. |
| `'unsafe-inline'` | `script-src` on public HTML only | Authorizes Next.js inline framework/RSC scripts in statically generated and ISR documents. Public `script-src` deliberately contains no nonce or hash because either source expression would make browsers ignore `'unsafe-inline'`. |
| Per-request `'nonce-…'` | `script-src` on `/dev` HTML only | Authorizes executable Next.js framework and hydration scripts emitted for that response. JSON-LD remains present as inert structured data. |
| Deterministic `'sha256-…'` hashes | `script-src` on `/dev` HTML only | Authorize the exact Zod jitless and theme bootstrap text emitted by the root layout because those two inline scripts do not carry nonce attributes. Tests recompute both hashes from the builders so content drift fails validation. |
| `'wasm-unsafe-eval'` | `script-src` | RDKit.js compiles the same-origin molecule-editor WASM module in the browser. The asset copy step replaces the package loader's two JavaScript code-generation paths with Emscripten's generic, non-dynamic invokers. This source does not permit JavaScript `eval`; plain `'unsafe-eval'` remains forbidden. |
| Exact configured Convex HTTPS origin | `connect-src` | The protected editor uses Convex's browser client for live queries and mutations. The origin is derived from the configured public Convex URL rather than a wildcard. |
| Matching exact Convex WSS origin | `connect-src` | Convex realtime subscriptions use WebSockets on the same deployment host. |
| `https://api.iconify.design`, `https://api.unisvg.com`, `https://api.simplesvg.com` | `connect-src` | The installed Iconify client fetches uncached icon collections from these three observed redundancy providers. Exact origins are listed; no Iconify wildcard is allowed. |
| `https://api.crossref.org` | `connect-src` | The protected editor's quick-add reference card resolves DOI metadata directly from Crossref. |
| `https://eutils.ncbi.nlm.nih.gov` | `connect-src` | The protected editor's quick-add reference card resolves PMID metadata through NCBI E-utilities. |
| `https://glad-minnow-656.convex.site` | `connect-src` | Both homepages' mailing-list signup posts to the production deployment's Convex HTTP-actions origin (`src/features/mailing-list/subscribe.ts`). Listed statically on every host because the Effect Index deployment configures no Convex URL yet hosts the form. |
| Same-origin `/ingest` | Covered by `'self'` in `connect-src` | Dose Wiki's approved-host PostHog client posts to this reverse proxy. CSP source lists cannot contain a bare path such as `/ingest`; the existing `'self'` expression authorizes it without a browser warning. The library is bundled and initialises with `disable_external_dependency_loading`, so it never injects a remote script and buys no `script-src` entry on any host. |
| `data:` | `img-src` and `font-src` | Existing inline image/font payloads and browser-generated presentation assets use data URLs. |
| `blob:` | `img-src`, `media-src`, and `worker-src` | Editor previews/downloads and media tooling create local object URLs; worker-capable tooling may use blob workers. |
| `https:` | `img-src` and `media-src` only | Convex-managed replications, contributor avatars, source favicons, and article media are editor-curated but intentionally span many external HTTPS publishers. This is a conscious content-source exception, not a script or connection wildcard. |
| `'unsafe-inline'` | `style-src` on all documents | Existing React style props and editor visual tools emit style attributes. In `script-src`, it is restricted to public documents as described above. |
| `/api/csp-report` | `report-uri` | Same-origin collection of directive and redacted-origin violation metadata. |

No frame origin is required. `frame-src 'none'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'` therefore fail closed.

## Baseline headers

Representative public HTML responses must include:

- `Content-Security-Policy` with script `'unsafe-inline'`, no nonce, no script hash, and no script `'unsafe-eval'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a minimal `Permissions-Policy` disabling accelerometer, camera, display capture, geolocation, gyroscope, magnetometer, microphone, payment, and USB

Representative `/dev` HTML responses must include:

- `Content-Security-Policy` with a unique nonce, both deterministic bootstrap hashes, no script `'unsafe-inline'`, and no script `'unsafe-eval'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a minimal `Permissions-Policy` disabling accelerometer, camera, display capture, geolocation, gyroscope, magnetometer, microphone, payment, and USB

Non-local production hosts also include `upgrade-insecure-requests`. Local HTTP is exempt so production-build smoke tests remain usable on localhost.

## Host policy

- `dose.wiki` and `www.dose.wiki`: construction gate plus the approved analytics client attachment; its same-origin proxy request is covered by `'self'`.
- `dosewiki-admin.vercel.app`, Vercel previews, localhost, and every other host: no analytics client attachment. CSP does not need a separate analytics source on any host.

## Verification contract

Before deployment, run the focused policy and middleware tests, lint, typecheck, and a production build. Start that build locally and use a real browser to verify:

- anonymous `/dev` navigation reaches the sign-in flow without CSP console errors;
- public pages are statically generated/ISR where declared and hydrate without CSP console errors;
- representative public pages hydrate and contain their JSON-LD;
- the database-backed molecule SVG loads and retains its sandbox CSP;
- a state-changing save request remains protected when anonymous;
- Convex is the only non-self realtime editor-data origin; Crossref and NCBI are limited to citation metadata lookups;
- admin HTML contains neither an analytics script nor an analytics CSP source.
- the molecule editor initializes RDKit in Firefox without an `unsafe-eval` CSP violation.
- the hash-authorized browser bootstrap selects Zod's supported `jitless` interpreter before application chunks load, avoiding its caught `Function("")` capability probe under strict `/dev` CSP.

Authenticated editor loading and a real save must be repeated on a preview deployment with a non-production test account before release. Local smoke intentionally does not use employee credentials or write production data.
