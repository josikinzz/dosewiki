# Browser Security Policy

Last reviewed: 2026-07-11

This document is the deployment and review contract for dose.wiki's enforced browser security headers.

## Enforcement model

Middleware creates a cryptographically random nonce for every HTML request, places the nonce-bearing CSP on the internal request so Next.js can nonce its framework and hydration scripts, and applies the same CSP to the document response. The nonce is not exposed as a standalone response header.

The separate `Content-Security-Policy-Report-Only` header used during the observation phase is no longer emitted. The enforced policy retains `report-uri /api/csp-report`, so violations continue to reach the size-limited, rate-limited, redacting collector without generating duplicate enforce/report-only events.

API routes do not receive the document CSP. They retain route-owned content policies; in particular, database-backed molecule SVGs keep their `sandbox` policy instead of being replaced by the HTML policy. The other baseline headers still apply to APIs.

## Reviewed source expressions

The source inventory below comes from repository tracing plus a local production-build browser smoke on 2026-07-11. It is not production telemetry; no production CSP log store was available to this implementation.

| Directive/source | Where allowed | Why it is required |
| --- | --- | --- |
| `'self'` | All directives that load app resources | Next.js chunks, same-origin APIs, local fonts/assets, the RDKit loader and WASM, and form submissions are served by the application origin. |
| Per-request `'nonce-…'` | `script-src` on HTML | Authorizes only the executable Next.js framework/hydration scripts, the Zod jitless policy bootstrap, and the theme bootstrap emitted for that response. JSON-LD remains present as inert structured data. |
| `'wasm-unsafe-eval'` | `script-src` | RDKit.js compiles the same-origin molecule-editor WASM module in the browser. The asset copy step replaces the package loader's two JavaScript code-generation paths with Emscripten's generic, non-dynamic invokers. This source does not permit JavaScript `eval`; plain `'unsafe-eval'` remains forbidden. |
| Exact configured Convex HTTPS origin | `connect-src` | The protected editor uses Convex's browser client for live queries and mutations. The origin is derived from the configured public Convex URL rather than a wildcard. |
| Matching exact Convex WSS origin | `connect-src` | Convex realtime subscriptions use WebSockets on the same deployment host. |
| `https://api.iconify.design`, `https://api.unisvg.com`, `https://api.simplesvg.com` | `connect-src` | The installed Iconify client fetches uncached icon collections from these three observed redundancy providers. Exact origins are listed; no Iconify wildcard is allowed. |
| `https://api.crossref.org` | `connect-src` | The protected editor's quick-add reference card resolves DOI metadata directly from Crossref. |
| `https://eutils.ncbi.nlm.nih.gov` | `connect-src` | The protected editor's quick-add reference card resolves PMID metadata through NCBI E-utilities. |
| `https://analytics.dose.wiki` | `script-src` and `connect-src`, exact `dose.wiki`/`www.dose.wiki` hosts only | The public construction page's approved analytics integration loads and submits events there. Admin, preview, lookalike, and local hosts omit it. |
| `data:` | `img-src` and `font-src` | Existing inline image/font payloads and browser-generated presentation assets use data URLs. |
| `blob:` | `img-src`, `media-src`, and `worker-src` | Editor previews/downloads and media tooling create local object URLs; worker-capable tooling may use blob workers. |
| `https:` | `img-src` and `media-src` only | Convex-managed replications, contributor avatars, source favicons, and article media are editor-curated but intentionally span many external HTTPS publishers. This is a conscious content-source exception, not a script or connection wildcard. |
| `'unsafe-inline'` | `style-src` only | Existing React style props and editor visual tools emit style attributes. It is intentionally absent from `script-src`. |
| `/api/csp-report` | `report-uri` | Same-origin collection of directive and redacted-origin violation metadata. |

No frame origin is required. `frame-src 'none'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'` therefore fail closed.

## Baseline headers

Representative HTML responses must include:

- `Content-Security-Policy` with a unique nonce, no script `'unsafe-inline'`, and no script `'unsafe-eval'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a minimal `Permissions-Policy` disabling accelerometer, camera, display capture, geolocation, gyroscope, magnetometer, microphone, payment, and USB

Non-local production hosts also include `upgrade-insecure-requests`. Local HTTP is exempt so production-build smoke tests remain usable on localhost.

## Host policy

- `dose.wiki` and `www.dose.wiki`: construction gate plus the approved analytics script/connect source.
- `dosewiki-admin.vercel.app`, Vercel previews, localhost, and every other host: no analytics source in CSP and no analytics script attachment.

## Verification contract

Before deployment, run the focused policy and middleware tests, lint, typecheck, and a production build. Start that build locally and use a real browser to verify:

- anonymous `/dev` navigation reaches the sign-in flow without CSP console errors;
- representative public pages hydrate and contain their JSON-LD;
- the database-backed molecule SVG loads and retains its sandbox CSP;
- a state-changing save request remains protected when anonymous;
- Convex is the only non-self realtime editor-data origin; Crossref and NCBI are limited to citation metadata lookups;
- admin HTML contains neither an analytics script nor an analytics CSP source.
- the molecule editor initializes RDKit in Firefox without an `unsafe-eval` CSP violation.
- the nonce-authorized browser bootstrap selects Zod's supported `jitless` interpreter before application chunks load, avoiding its caught `Function("")` capability probe under strict CSP.

Authenticated editor loading and a real save must be repeated on a preview deployment with a non-production test account before release. Local smoke intentionally does not use employee credentials or write production data.
