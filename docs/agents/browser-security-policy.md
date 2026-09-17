# Browser Security Policy

Source contract reviewed: 2026-09-16. Historical browser smoke: 2026-07-11; no new runtime verification is implied.

This document is the deployment and review contract for dose.wiki's enforced browser security headers.

## Enforcement model

Middleware splits the document CSP by path:

- Public documents (outside `/dev`) use inline-compatible script policy without nonce or script hashes. `lib/next/cspObservationPolicy.ts` owns the exact sources, including the public Turnstile script. Middleware does not forward `x-nonce`, keeping the root layout request-independent for static generation and ISR.
- Protected `/dev` documents use a fresh nonce on the internal request and response CSP, not a standalone response header. The policy includes deterministic bootstrap hashes, including the flavor-conditional Theme Lab hash. When changing bootstraps, inspect the policy's current builders instead of assuming a fixed hash count.

The separate `Content-Security-Policy-Report-Only` header used during the observation phase is no longer emitted. The enforced policy retains `report-uri /api/csp-report`, so violations continue to reach the size-limited, rate-limited, redacting collector without generating duplicate enforce/report-only events.

API routes do not receive the document CSP. They retain route-owned content policies; in particular, database-backed molecule SVGs keep their `sandbox` policy instead of being replaced by the HTML policy. The other baseline headers still apply to APIs.

## Reviewed source expressions

`lib/next/cspObservationPolicy.ts` is the single directive/source inventory.
The earlier local production-build browser smoke is historical evidence, not
production telemetry. Review the branch relevant to the change:

- Public feedback widgets: retain the exact Turnstile script/frame origin.
- Editor media uploads: only `/dev` may add the validated R2 upload origin to
  `connect-src`; inspect `getR2UploadOrigin` and the approved editor CORS contract
  in [deployment](deployment.md#native-completion-release-prerequisites).
- Replication embeds: `lib/next/replicationEmbedPolicy.ts` owns the exact path and
  parent-origin allowlist. Only that branch relaxes `frame-ancestors` and omits
  `X-Frame-Options`; ordinary documents deny framing. Its fullscreen/autoplay
  permissions and noindex header remain branch-specific.
- Same-origin data and analytics: no browser Postgres or archived database origin
  is needed. Icon and citation metadata providers remain exact source entries,
  not wildcards. HTTPS image/media allowances do not authorize script/connect origins.
- RDKit: production permits WASM compilation, not JavaScript `unsafe-eval`.
  Development debugging is a separate source branch, not a release exception.

Keep object loading closed, base/form origins constrained and the collector's
redaction/rate limits intact. Any source expansion requires review of the exact
consumer and branch, not a blanket copied policy.

## Baseline headers

Representative public HTML responses must include:

- `Content-Security-Policy` with script `'unsafe-inline'`, no nonce, no script hash, and no script `'unsafe-eval'`
- `X-Frame-Options: DENY` on ordinary pages; the exact replication embed instead uses its CSP ancestor allowlist and noindex header
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a minimal `Permissions-Policy` disabling accelerometer, camera, display capture, geolocation, gyroscope, magnetometer, microphone, payment, and USB

Representative `/dev` HTML responses must include:

- `Content-Security-Policy` with a unique nonce and all applicable deterministic bootstrap hashes, no script `'unsafe-inline'`, and no production script `'unsafe-eval'`
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
- same-origin APIs are the editor data path; archived database services add no browser connection origins; Crossref and NCBI remain limited to citation metadata lookups;
- admin HTML contains neither an analytics script nor an analytics CSP source.
- the public Turnstile widget loads under its exact script/frame allowance;
- an authorized editor upload uses only its approved R2 connect origin; public pages do not receive that upload allowance;
- the replication embed accepts only allowed parents and has no conflicting X-Frame-Options header, while ordinary pages remain unframeable.
- the molecule editor initializes RDKit in Firefox without an `unsafe-eval` CSP violation.
- the hash-authorized browser bootstrap selects Zod's supported `jitless` interpreter before application chunks load, avoiding its caught `Function("")` capability probe under strict `/dev` CSP.

Authenticated editor loading and a real save must be repeated on a preview deployment with a non-production test account before release. Local smoke intentionally does not use employee credentials or write production data.
