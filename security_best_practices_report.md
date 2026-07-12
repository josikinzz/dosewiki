# dose.wiki Security Audit

**Audit date:** July 11, 2026

**Scope:** Database integrity, Convex functions, authenticated editor and API routes, development/admin tools, public rendering, deployment boundaries, dependencies, and security automation.

**Method:** Static review of the current worktree, focused security tests, dependency audit, and read-only checks against the public and admin hosts. No destructive testing was performed.

## Executive summary

I did **not** find a confirmed anonymous path that writes to the Convex database. All 49 public Convex mutations in the current tree call an authentication or editor-authorization helper, and the seven especially destructive operations are internal mutations. The `/dev` surface is also protected at both middleware and server-page layers.

That is a meaningful foundation, but it is not enough for safety-critical publishing. At the audit point, four high-severity integrity risks remained:

1. A remote analytics script executes on the authenticated admin origin. If that separate service or its DNS is compromised, its JavaScript can make same-origin editor requests and change live content.
2. The production credentials provider grants the `admin` role and has no application-level login throttling or MFA.
3. An editor save replaces live content and purges caches immediately. There is no independent approval, optimistic concurrency check, immutable audit event, or first-class rollback boundary.
4. The citation apply mutation trusts the caller to preserve the reviewed, citation-only shape instead of enforcing that restriction at the database boundary.

The central safety concern is therefore not “can a random visitor call an unprotected mutation?” The current code strongly reduces that risk. It is: **what happens after one editor session, legacy password, scoped token, master key, workstation, or adjacent script host is compromised?** Today, the answer can be immediate publication of structurally valid but false harm-reduction information.

### Finding count

- Critical: 0
- High: 4
- Medium: 10
- Low: 2

No evidence of active exploitation or existing database tampering was found. This audit did not forensically validate every deployed record or inspect external account dashboards.

## Post-audit implementation status

The finding count and severity ratings above are the original July 11, 2026 audit result. The following status records later implementation work that has been accepted **in the current uncommitted worktree only**. It has not been deployed or operationally verified in production, so these entries do not claim that the live site is remediated.

| Finding | Tracking issue | Current-worktree status | Deployment and residual verification |
|---|---|---|---|
| SEC-01 | [#32](https://github.com/josikinzz/dosewiki-admin/issues/32) | **Remediated in the current worktree.** Admin and preview hosts no longer emit the remote analytics script; exact approved public hosts retain explicit analytics behavior. | Not deployed. Preview/production host behavior and the report collector still need deployment verification. The subsequent SEC-11 / #49 implementation replaces observation-only CSP in the current worktree. |
| SEC-08 | [#34](https://github.com/josikinzz/dosewiki-admin/issues/34) | **Remediated in the current worktree.** Audited production writers now default to dry-run or fail closed, require an operation-specific confirmation and exact deployment fingerprint, prefer scoped credentials, redact sensitive output, and retire two obsolete direct writers. | No live write was performed. The operator ceremony still needs supervised validation against the intended production deployment before routine use. |
| SEC-13 | [#35](https://github.com/josikinzz/dosewiki-admin/issues/35) | **Remediated for current-tree and CI scanning in the current worktree.** Secret checks scan tracked file types without printing matched values; CI actions and Bun are pinned; workflow permissions are read-only; dependency audits publish non-blocking artifacts. | The work is not yet running on the repository's pushed CI configuration. Full-history secret scanning and GitHub-hosted push-protection settings remain unverified. Dependency auditing now follows the documented #50 exception baseline. |
| SEC-11 | [#49](https://github.com/josikinzz/dosewiki-admin/issues/49) | **Remediated in the current worktree.** HTML receives a host-aware per-request nonce CSP plus anti-framing, MIME, referrer, and permissions headers. Public analytics and Convex/Iconify connections are narrowly host/origin scoped; database-backed SVGs retain their route-owned sandbox CSP. | Not deployed. An authenticated editor load and real save on preview with a non-production test account remain required, followed by representative deployed-response verification. |
| SEC-12 | [#50](https://github.com/josikinzz/dosewiki-admin/issues/50) | **Remediated to the documented exception baseline in the current worktree.** Production advisories fell from 4 to 1 with no remaining High; the full graph fell from 27 to 6. Convex/ws and affected build/test chains were upgraded. | The six remaining audit entries reduce to three reviewed, owner-assigned, time-limited exception chains with review and expiry dates. No deployment occurred; audits must continue to be reviewed on schedule. |

Original evidence is retained below so the conditions observed during the audit remain independently reviewable.

## Highest-priority findings

### HIGH — SEC-01: Remote analytics JavaScript runs on the admin/editor origin

**Implementation status:** Remediated in the current uncommitted worktree under [#32](https://github.com/josikinzz/dosewiki-admin/issues/32), but not deployed or production-verified. The original audit evidence below is intentionally retained. The separate SEC-11 browser-policy gap was subsequently remediated in the current worktree under #49.

**Plain-English risk:** The admin site downloads and runs JavaScript from a separate Railway-hosted analytics deployment. If that service, account, or DNS is compromised, the attacker’s code runs inside an editor’s authenticated admin page. It does not need to steal the HttpOnly cookie; it can simply make same-origin save requests from the browser.

**Evidence**

- `src/app/layout.tsx:17-23` defines `https://analytics.dose.wiki/script.js` and describes public-host tracking.
- `src/app/layout.tsx:72-87` mounts it unconditionally in the shared root layout.
- The `data-domains` option tells the downloaded script what to record; it does not prevent the browser from executing that script on the admin host.
- A read-only live check confirmed that the admin HTML includes the script.

**Recommended remediation**

1. Do not load analytics at all on admin or preview hosts. Use a host-specific public layout or a server-side host decision.
2. Prefer a reviewed, self-hosted, version-pinned asset if client-side analytics remains necessary.
3. After removing the admin dependency, introduce a nonce-based Content Security Policy.
4. Rotate and review the Railway deployment and DNS access as a precaution; this audit found no evidence they are compromised.

### HIGH — SEC-02: Production legacy credentials grant admin without app-level throttling or MFA

**Plain-English risk:** Anyone who obtains one configured legacy password becomes an admin. The Auth.js catch-all route is not covered by the application rate limiter, and this authentication path has no second factor.

**Evidence**

- `auth.ts:31-55` enables the credentials provider when password environment variables exist.
- `src/lib/auth/roles.ts:5-20` maps credential users to `admin`.
- `lib/auth/runtimePolicy.ts:90-95,116-135` permits the provider in preview/production when its configuration is present.
- `src/app/api/auth/[...nextauth]/route.ts:1-6` exposes the Auth.js handler without the shared rate-limiting wrapper.
- `auth.ts:59-63,84-93` uses JWT sessions and remaps local credential tokens to admin; no short explicit maximum lifetime or immediate revocation mechanism is evident.
- A read-only live check confirmed that the credentials provider is active.

**Recommended remediation**

1. Disable credentials outside localhost by default. If an emergency account is retained, require an explicit break-glass flag and keep it normally off.
2. Use an MFA-capable identity provider and enforce a specific organization, team, or email allowlist.
3. Add distributed throttling keyed by both IP and submitted username, plus Vercel firewall protection.
4. Use short admin sessions and a documented revocation procedure.

### HIGH — SEC-03: Any editor save immediately replaces live safety content

**Plain-English risk:** The system validates the shape of an article, not the truth of its medical claims or the identity of its approver. One stolen editor session—or one stale editor tab—can replace a newer correction, mark content reviewed, and publish it to the public site.

**Evidence**

- `convex/lib/auth.ts:201-215` authorizes both editors and admins for editor writes.
- `src/app/api/save-to-convex/route.ts:250-256` writes submitted articles into the live substance table.
- `src/app/api/save-to-convex/route.ts:373-377` immediately revalidates public paths and clears derived caches.
- `convex/lib/substanceIngestion.ts:195-226` replaces the document without requiring an expected revision or hash.
- `convex/substanceIndex.ts:195,235,298` does not create an immutable audit event for every core save/delete.
- `src/schema/substance/article.ts:17-41` stores review status in the same editor-writable article contract.
- `src/features/article/components/sections/ContributorsSection.tsx:105-112` turns that field into a public expert-approval statement.
- Changelog creation in `src/app/api/save-to-convex/route.ts:337-371` is conditional on caller-supplied data, and `convex/changelog.ts:40-89` can update an existing entry.

**Tampering path**

1. Attacker obtains any editor-capable session or token.
2. Zod confirms that the submitted document has the expected structure.
3. The live row is replaced without checking whether the editor started from the latest revision.
4. Cache revalidation makes the new content public.
5. React safely renders the attacker’s false text. Escaping prevents HTML injection; it cannot detect misinformation.

**Recommended remediation**

1. Introduce immutable article revisions with `draft`, `reviewed`, and `published` states.
2. Make public queries read only a `publishedRevisionId`.
3. Require an approver distinct from the author for dosage, interactions, contraindications, and harm-reduction changes.
4. Record author, approver, timestamp, before/after hashes, and reason server-side in append-only events.
5. Require `expectedRevision` or an equivalent compare-and-swap value on every edit.
6. Provide a tested one-command rollback and public-cache purge procedure.
7. Do not display a named expert approval unless that expert identity performed the approval.

### HIGH — SEC-04: Citation application does not enforce “citation-only” changes in Convex

**Plain-English risk:** The local citation workflow has review and confirmation safeguards, but the final database mutation accepts caller-supplied patches to broad article sections. A compromised workstation or scoped token can bypass the local script’s intent and send fabricated-looking evidence or non-citation content directly.

**Evidence**

- `convex/citationEvidence.ts:602-627` exposes `applyDraft`, authorizes the write, and validates the general article contract.
- `convex/citationEvidence.ts:87-115` applies caller-provided patches to citable sections including summary, pharmacology, tolerance, harm reduction, history, and legality.
- The stronger explicit confirmation and backup behavior is in the local caller at `scripts/citations/apply-workbench-draft.mjs:52,119`.
- Workbench adaptation logic is in `scripts/citations/workbench-draft-adapter.mjs:98`, not an independently enforced database invariant.

**Recommended remediation**

1. In Convex, compare current and proposed content after removing citation markers; require the underlying prose to be byte-for-byte or structurally identical for a citation-only operation.
2. Require an expected article revision.
3. Validate one-to-one correspondence among markers, references, evidence records, and source locators.
4. Store the proposed change as pending and require a separate reviewer to promote it.
5. Make the final patch an `internalMutation` invoked only after all server-side checks pass.

## Medium-severity findings

### MEDIUM — SEC-05: Editor/raw Convex queries are publicly callable

Middleware protects the `/dev` page, but it does not protect Convex query endpoints. Anonymous callers can retrieve raw/editor projections, operational prompts, quote/workbench data, sources, and molecule templates. This is a confidentiality and scraping/cost issue, not a demonstrated write bypass.

**Evidence:** `convex/substanceIndex.ts:20-24,57-72,102-123`; `convex/lib/substanceReadProjections.ts:41-56,116-134`; `convex/prompts.ts:16-34`; `convex/articleSources.ts:36-44,79-84`; `convex/quotes.ts:20-47,79-115`; `convex/moleculeClassTemplates.ts:23-31`; browser consumer `src/hooks/useLazyLibrary.ts:22-26`.

**Fix:** Keep only deliberate public projections anonymous. Authenticate the editor browser to Convex with a verified identity, or proxy editor reads through authenticated Next handlers. Convert privileged reads to authenticated queries or `internalQuery` and remove legacy raw functions.

### MEDIUM — SEC-06: The broad Convex admin key remains a universal fallback

`lib/convex/serverWriteCapability.ts:54-65,126-160` requires the master key and can fall back to it for scoped operations. `convex/lib/adminIntentTokens.ts:65-85` accepts that legacy key for any intent. `src/app/api/save-to-convex/route.ts:284-291` explicitly uses the global capability for category mirroring.

**Fix:** Make scoped intent tokens sufficient for each route, create a category-layout intent, remove the production master-key fallback, rotate the master key, and keep migration credentials out of the web runtime.

### MEDIUM — SEC-07: Several legacy mutations require identity but not editor role

The current browser setup does not appear to provide Convex identity, so these paths are presently dormant. If Convex authentication is enabled later, any authenticated viewer could gain broader write access than intended.

**Evidence:** identity-only helper `convex/lib/auth.ts:90-118`; role-aware helper `convex/lib/auth.ts:201-215`; category writes `convex/categoryLayout.ts:46-80`; index writes `convex/indexLayouts.ts:110-169`; effects `convex/subjectiveEffects.ts:285+`; trips `convex/tripReports.ts:216-263`; prompts `convex/prompts.ts:93-130`; quotes `convex/quotes.ts:176+`; replication maintenance `convex/replications.ts:237,390+`.

**Fix:** Use `requireEditorWrite` consistently for editorial and maintenance operations. Reserve identity-only writes for records whose ownership is checked against that same identity.

### MEDIUM — SEC-08: Local admin and migration tools can write live too easily

**Implementation status:** Remediated in the current uncommitted worktree under [#34](https://github.com/josikinzz/dosewiki-admin/issues/34). Focused workflow checks passed during implementation and no live write was performed; deployment-target/operator verification remains outstanding.

Several scripts default to a live operation or accept a broad key without a sufficiently specific confirmation ceremony. A typo, copied command, or compromised workstation can cause production changes.

**Evidence:** generic admin CLI `scripts/admin/convex-admin.mjs:46,83,107`; schema migration `scripts/migrate/migrate-pharmacology-schema.mjs:12,210`; dosage apply `scripts/batch/apply-dosage-duration-rewrite-results.mjs:56,349`; one-off direct writers `scripts/clean-legality-references.mjs:27` and `scripts/fix-harm-source-mentions.mjs:105`.

**Fix:** Default every tool to dry-run. Require `--write`, an operation-specific confirmation phrase, explicit deployment fingerprint, a fresh backup/revision, and the narrowest scoped credential. Archive obsolete one-off writers.

### MEDIUM — SEC-09: Cookie-authenticated custom writes lack an explicit same-origin/CSRF boundary

Auth.js cookies were live-verified as `Secure`, `HttpOnly`, and `SameSite=Lax`, which is a useful defense. However, `src/lib/http/protectedRouteOperation.ts:57-107` does not centrally validate `Origin`, `Host`, `Sec-Fetch-Site`, or a CSRF token/header, and `src/lib/http/readJsonBody.ts:17-35` parses arbitrary text without requiring JSON content type.

**Fix:** For unsafe methods, centrally enforce same-origin `Origin`, `Sec-Fetch-Site`, `Content-Type: application/json`, and a custom CSRF header or token. Add focused rejection tests.

### MEDIUM — SEC-10: Sensitive rate limits can fall back to per-instance memory

`lib/http/nextRateLimit.ts:185-201` falls back to an in-memory limiter when Redis is missing or fails. That does not provide a global limit across serverless instances. `lib/http/rateLimitPolicy.ts:15-21,26-91` is IP-only, and the credentials sign-in handler is not covered.

**Fix:** Require a healthy distributed store and fail closed for sign-in and high-impact writes. Combine actor and IP keys, verify Vercel’s forwarded-IP behavior, add health alerts, and use platform firewall rules.

### MEDIUM — SEC-11: Global browser security headers are missing

**Implementation status:** Remediated in the current uncommitted worktree under [#49](https://github.com/josikinzz/dosewiki-admin/issues/49). HTML now receives a host-aware per-request nonce CSP plus anti-framing, MIME, referrer, and permissions headers; route-owned database-backed SVG sandbox CSP remains intact. Focused checks and a local real-browser smoke passed. Authenticated editor loading and a real save on preview, followed by deployed-response verification, remain required before release. No deployment or write occurred.

`next.config.ts:34-78` defines no global header policy. Live checks found HSTS but no CSP, `frame-ancestors`/X-Frame-Options, `nosniff`, referrer policy, or permissions policy. The molecule SVG endpoints are a positive exception: `src/app/api/molecules/[slug]/route.ts:42-52` applies a sandbox and `nosniff`.

**Fix:** Start with CSP report-only, then enforce a nonce-based policy. Add `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `X-Content-Type-Options: nosniff`, a strict referrer policy, and a minimal permissions policy.

### MEDIUM — SEC-12: The dependency lock contains known advisories

**Implementation status:** Remediated to the documented exception baseline in the current uncommitted worktree under [#50](https://github.com/josikinzz/dosewiki-admin/issues/50). Production advisories fell from 4 to 1 with no remaining High, and full-graph advisories fell from 27 to 6. Convex/ws and affected build/test chains were upgraded. The six remaining entries reduce to three reviewed, owner-assigned, time-limited exception chains documented in `docs/agents/dependency-security.md`. No deployment or database write occurred.

`bun audit --json` reported 27 advisories: 15 high, 10 moderate, and 2 low. `ws@8.18.0` is pulled through the runtime dependency `convex@1.39.1`; many other advisories are in development/build tools such as Vite, Rollup, jsdom, ESLint, and Webpack-related packages. No reachable production exploit was confirmed. Next.js `16.2.6` is at the patched version for the May 2026 middleware-bypass advisory.

**Fix:** Upgrade Convex and the affected toolchain, rerun focused and full tests, run `bun audit --production` in CI, and maintain a reviewed, time-limited allowlist only for advisories demonstrated to be unreachable.

### MEDIUM — SEC-13: Secret scanning can echo secrets and misses file types

**Implementation status:** Remediated for current-tree and CI scanning in the current uncommitted worktree under [#35](https://github.com/josikinzz/dosewiki-admin/issues/35). Residual gaps: the updated workflow has not run from a pushed revision, full Git history was not scanned, and GitHub push-protection settings remain unverified. Dependency auditing now follows the remediated, documented SEC-12 / #50 exception baseline.

`.github/workflows/vercel-policy-checks.yml:34-50` and `.husky/check-secrets.sh:47-60` print matching lines. If a real secret is added, the scanner can copy it into retained CI or terminal output. The CI grep also omits several tracked file types. No tracked secret was found; only `.env.example` is tracked and local environment files are ignored.

**Fix:** Use a dedicated scanner such as Gitleaks with redacted output, current-tree and history coverage, and filename/rule-only reporting. Enable GitHub secret scanning and push protection. Add dependency auditing. Pin GitHub Actions by commit SHA and pin Bun instead of using `latest`.

### MEDIUM — SEC-14: Bulk replacement deletes first and can silently skip invalid rows

`convex/substanceIndex.ts:260-283` deletes existing content before completing validation and can skip invalid inputs. It is an internal mutation, which reduces exposure, but a bad authorized invocation can still produce a partial or empty dataset.

**Fix:** Prevalidate every row, uniqueness constraint, minimum count, and manifest hash before deleting anything. Abort on the first invalid record and preserve a revision/backup for atomic rollback.

## Low-severity findings

### LOW — SEC-15: Authenticated sign-in callback can redirect off-site

`lib/next/statusRedirectPolicy.ts:71-73` accepts an arbitrary callback and `src/app/sign-in/page.tsx:32-45` redirects an already authenticated user to it. Restrict callbacks to same-origin paths—preferably an allowlisted `/dev` path—and reject protocol-relative (`//`) and absolute URLs.

### LOW — SEC-16: Privileged Convex target selection can fall back to a browser-facing variable

`lib/convex/runtimeTargets.ts:43-47,88-109` permits fallback to a browser-exposed deployment URL and only warns about ambiguity. For privileged production writes, require an explicit server-only Convex URL and expected deployment identifier; refuse to start on mismatch.

## Verified strengths

- **No anonymous mutation found:** all 49 public Convex mutations invoke an authentication/editor helper; seven destructive functions are internal.
- **Layered `/dev` gate:** `middleware.ts:79-107` and `src/app/dev/[[...segments]]/page.tsx:72-107` both enforce access.
- **Protected Next writes:** editor APIs use session/role guards such as `src/lib/auth/requireEditorSession.ts:25-47`.
- **Strong article shape validation:** writes use the canonical Zod contract through `convex/lib/validators.ts:69` and `convex/lib/substanceIngestion.ts:179`.
- **Public data minimization exists:** deliberate public projections remove full editorial-review objects.
- **Production diagnostics default closed:** the live `/api/test-env` probe returned 404; protected health and citation endpoints returned 401 without a session.
- **Safe rendering in the reviewed paths:** normal database prose is rendered as React text. JSON-LD escapes script-breaking characters, and database-backed SVG endpoints use `sandbox` and `nosniff`.
- **Public host construction gate works:** live checks confirmed that the full app/editor is not exposed on `dose.wiki` or `www.dose.wiki`.
- **Secrets are ignored:** `.env*` is ignored except `.env.example`; no tracked credential was found in this review.
- **Focused tests passed:** 7 test files and 46 authorization, role, runtime-policy, and diagnostics-disclosure tests passed.

## Recommended remediation order

This is the original audit roadmap. The post-audit status section above records which items are code-complete in the current worktree and which remain open; none of those status updates claims production deployment.

### Within 72 hours

1. Remove the analytics script from admin and preview hosts.
2. Disable production credentials authentication or convert it to normally-off break-glass access; enforce MFA on the primary identity provider.
3. Take and verify a Convex backup, record the deployment identifier, and document emergency rollback/cache purge.
4. Rotate the broad Convex admin key and confirm which routes use scoped tokens versus fallback.
5. Make all production-writing scripts dry-run by default and require explicit deployment-bound confirmation.

### Within two weeks

1. Add immutable revisions, `expectedRevision`, append-only audit events, and draft/review/publish separation.
2. Make expert approval an independently authenticated server event, not an editor-writable content field.
3. Move editor/raw Convex reads behind an authenticated boundary.
4. Enforce citation-only invariants inside Convex.
5. Add centralized same-origin/CSRF/content-type enforcement and distributed fail-closed limits for sensitive operations.

### Within 30 days

1. Deploy a staged CSP and the remaining browser security headers.
2. Patch dependency advisories and add CI auditing.
3. Replace grep-based secret checks with a redacting scanner; pin CI dependencies.
4. Run a restore drill and an incident exercise for “false safety content was published.”
5. Add alerts for unexpected article changes, role changes, unusual write volume, and use of break-glass credentials.

## External controls still requiring verification

These cannot be established from the repository or unauthenticated host checks:

- Whether the deployed Convex functions exactly match this worktree.
- Convex and Vercel MFA, team membership, least-privilege roles, dashboard audit logs, and deployment protection.
- Convex backup schedule, retention, immutable/off-platform copies, and actual restore-test results.
- Whether every production route has a scoped Convex intent token and whether the master-key fallback is still configured.
- Upstash availability/alerts and Vercel firewall or bot protection.
- GitHub branch protection, Advanced Security, secret push protection, Dependabot, and historical secret leakage.
- Whether any existing live record was previously altered by an authorized or compromised account.

## Validation performed

- Enumerated public/internal Convex functions and inspected authorization helpers, schemas, ingestion, projections, and target selection.
- Reviewed editor/API route guards, rate limiting, JSON parsing, authentication, middleware, dev tools, migrations, and direct-write scripts.
- Reviewed public rendering sinks, remote scripts, SVG responses, host policy, deployment configuration, and CI secret handling.
- Ran seven focused Vitest files: **46 tests passed**.
- Ran `bun audit --json`: **27 advisories** reported; reachability was reviewed at a high level.
- Performed read-only checks of public/admin routes, headers, auth-provider exposure, and diagnostic endpoint behavior.

## Important limitations

This is a code and configuration audit, not a full penetration test or incident investigation. It did not brute-force authentication, mutate production data, inspect private cloud dashboards, scan full Git history with a dedicated secret scanner, or cryptographically compare all deployed content against trusted source material. Severity reflects both technical exploitability and the unusually high consequence of publishing false drug-safety information.

## Primary security references

- Convex: [Internal functions](https://docs.convex.dev/functions/internal-functions)
- Convex: [Authentication in functions](https://docs.convex.dev/auth/functions-auth)
- Convex: [Backup and restore](https://docs.convex.dev/database/backup-restore)
- Next.js: [Security headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- Next.js: [Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- Next.js: [Backend-for-frontend security guidance](https://nextjs.org/docs/app/guides/backend-for-frontend)
- Next.js: [May 2026 middleware bypass advisory](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6)
